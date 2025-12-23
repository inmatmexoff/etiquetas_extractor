
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeft, ChevronRight, UploadCloud, Database } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


// HACK: Make pdfjs work on nextjs
let pdfjsLib: any = null;
if (typeof window !== "undefined") {
  pdfjsLib = (window as any).pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  }
}

interface Rectangle {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExtractedData {
    label: string;
    value: string;
    page: number;
}

type GroupedExtractedData = {
    page: number;
    [key: string]: string | number;
};


const PREDEFINED_RECTANGLES_DEFAULT: Rectangle[] = [
    { label: "FECHA ENTREGA", x: 293, y: 311, width: 137, height: 33 },
    { label: "CANTIDAD", x: 69, y: 96, width: 50, height: 69 },
    { label: "CLIENTE INFO", x: 48, y: 933, width: 291, height: 119 },
    { label: "CODIGO DE BARRA", x: 144, y: 445, width: 154, height: 30 },
    { label: "NUM DE VENTA", x: 53, y: 51, width: 168, height: 25 },
    { label: "PRODUCTO", x: 156, y: 88, width: 269, height: 60 },
];

const ALTERNATIVE_RECTANGLES: Rectangle[] = [
    { label: "FECHA ENTREGA", x: 291, y: 309, width: 140, height: 37 },
    { label: "CANTIDAD", x: 55, y: 97, width: 71, height: 69 },
    { label: "CLIENTE INFO", x: 45, y: 933, width: 298, height: 123 },
    { label: "CODIGO DE BARRA", x: 52, y: 445, width: 355, height: 15 },
    { label: "NUM DE VENTA", x: 54, y: 57, width: 159, height: 27 },
    { label: "PRODUCTO", x: 0, y: 0, width: 0, height: 0 },
];


const PDF_RENDER_SCALE = 1.5;

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageRendering, setPageRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingAreaRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);

  // Drawing state is now initialized with predefined rectangles
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);

  // Extraction state
  const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Load predefined rectangles when component mounts
    setRectangles(PREDEFINED_RECTANGLES_DEFAULT);
  }, []);

  const handleExtractData = async (doc: any) => {
    if (!doc) return;
    setIsLoading(true);
    setExtractedData([]);
    setError(null);

    try {
        const allData: ExtractedData[] = [];

        for (let currentPageNum = 1; currentPageNum <= doc.numPages; currentPageNum++) {
            const page = await doc.getPage(currentPageNum);
            const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
            const textContent = await page.getTextContent();
            
            let useAlternativeRects = false;
            // A simple heuristic to decide which set of rectangles to use.
            // Check for a specific text in a specific area.
            const productAreaForCheck = PREDEFINED_RECTANGLES_DEFAULT.find(r => r.label === 'PRODUCTO');
            if (productAreaForCheck) {
                const itemsInProductArea = textContent.items.filter((item: any) => intersects(item, productAreaForCheck, viewport));
                const productText = itemsInProductArea.map((item: any) => item.str).join(' ');
                if (productText.includes("Prepará el paquete")) {
                     useAlternativeRects = true;
                }
            }
            
            const activeRectangles = useAlternativeRects ? ALTERNATIVE_RECTANGLES : PREDEFINED_RECTANGLES_DEFAULT;

            for (const rect of activeRectangles) {
                if (rect.width === 0 && rect.height === 0) continue;

                const itemsInRect = textContent.items.filter((item: any) => intersects(item, rect, viewport));

                itemsInRect.sort((a: any, b: any) => {
                    const yA = a.transform[5];
                    const yB = b.transform[5];
                    if (Math.abs(yA - yB) < 2) {
                        return a.transform[4] - b.transform[4];
                    }
                    return yB - yA;
                });

                let extractedText = itemsInRect.map((item: any) => item.str).join(' ');
                
                if (rect.label === 'CANTIDAD') {
                    extractedText = extractedText.replace(/Cantidad|Productos|Unidad|Unidades/gi, '').trim();
                } else if (rect.label === 'FECHA ENTREGA') {
                    const monthMap: { [key: string]: string } = {
                        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
                        'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
                    };
                    const daysOfWeek = /lunes|martes|miércoles|jueves|viernes|sábado|domingo/gi;
                    
                    let cleanText = extractedText.replace(/ENTREGAR:|ENTREGAR/gi, '').replace(daysOfWeek, '').replace(':', '').trim();
                    
                    const datePartsNumeric = cleanText.split('/');
                    if (datePartsNumeric.length === 3) {
                        const day = datePartsNumeric[0].padStart(2, '0');
                        const month = datePartsNumeric[1].padStart(2, '0');
                        const year = datePartsNumeric[2];
                        extractedText = `${year}-${month}-${day}`;
                    } else if (datePartsNumeric.length >= 2) { // Handle "7/feb"
                        const day = datePartsNumeric[0].padStart(2, '0');
                        const monthStr = datePartsNumeric[1].toLowerCase().substring(0,3);
                        const month = monthMap[monthStr];
                        if (month) {
                           // Assuming current or next year. For now, hardcoding 2025.
                           // A more robust solution might be needed.
                           extractedText = `2025-${month}-${day}`;
                        }
                    }
                } else if (rect.label === 'CODIGO DE BARRA') {
                    const numbers = extractedText.match(/\d+/g);
                    extractedText = numbers ? numbers.join('') : '';
                } else if (rect.label === 'NUM DE VENTA') {
                    const numbers = extractedText.match(/\d+/g);
                    extractedText = numbers ? numbers.join('') : '';
                } else if (rect.label === 'PRODUCTO') {
                    const skuMatch = extractedText.match(/SKU:\s*(\S+)/);
                    if (skuMatch && skuMatch[1]) {
                        allData.push({ label: 'SKU', value: skuMatch[1], page: currentPageNum });
                        extractedText = extractedText.replace(skuMatch[0], '').trim();
                    }
                }


                if (extractedText.trim() !== '') {
                    allData.push({ label: rect.label, value: extractedText.trim(), page: currentPageNum });
                }
            }
             if (useAlternativeRects) {
                 allData.push({ label: 'PRODUCTO', value: 'VARIOS', page: currentPageNum });
                 // SKU might not be available in this format, or needs a different extraction method
             }
        }

        if (allData.length === 0) {
             setError("No se pudo extraer texto de ninguna página utilizando las áreas definidas.");
        } else {
            setError(null);
        }
        setExtractedData(allData);

    } catch(e) {
        console.error("Error extracting data", e);
        setError("Ocurrió un error al extraer los datos.");
    } finally {
        setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!pdfFile || !pdfjsLib) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);
      try {
        const doc = await pdfjsLib.getDocument({ data: typedArray }).promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        setExtractedData([]); // Clear extracted data for new PDF
        handleExtractData(doc); // Auto-extract data
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("No se pudo cargar el archivo PDF.");
      }
    };
    reader.readAsArrayBuffer(pdfFile);

    // We need to create a new file object for the scanner as it can be consumed.
    const fileForScanner = new File([pdfFile], pdfFile.name, { type: pdfFile.type });
    scanQrCode(fileForScanner);
  }, [pdfFile]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(pageNum);
    }
  }, [pdfDoc, pageNum]);

  const renderPage = async (num: number) => {
    if (!pdfDoc || pageRendering) return;

    setPageRendering(true);
    try {
      const page = await pdfDoc.getPage(num);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (drawingAreaRef.current) {
        drawingAreaRef.current.style.width = `${viewport.width}px`;
        drawingAreaRef.current.style.height = `${viewport.height}px`;
      }

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };
      await page.render(renderContext).promise;
    } catch(e) {
        console.error("Error rendering page", e);
    } finally {
        setPageRendering(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setError(null);
      setQrCodeValue(null);
      setPdfDoc(null);
    } else {
      setPdfFile(null);
      setPdfDoc(null);
      setQrCodeValue(null);
      setError("Por favor, sube un archivo PDF válido.");
    }
  };

  const scanQrCode = async (file: File) => {
    try {
      const html5QrCode = new Html5Qrcode("qr-reader", /* verbose= */ false);
      const decodedText = await html5QrCode.scanFile(file, /* showImage= */ false);
      console.log("QR Code Found:", decodedText);
      setQrCodeValue(decodedText);
    } catch (err) {
      setQrCodeValue(null);
      console.log("QR Code scan failed or no QR code found.", err);
    }
  };
  
  const onPrevPage = () => {
    if (pageNum <= 1) return;
    setPageNum(pageNum - 1);
  };

  const onNextPage = () => {
    if (pageNum >= numPages) return;
    setPageNum(pageNum + 1);
  };

  const intersects = (pdfTextItem: any, drawnRect: Rectangle, viewport: any) => {
      // Convert drawnRect (canvas coords) to PDF coords
      const pdfRectTopLeft = viewport.convertToPdfPoint(drawnRect.x, drawnRect.y);
      const pdfRectBottomRight = viewport.convertToPdfPoint(drawnRect.x + drawnRect.width, drawnRect.y + drawnRect.height);

      const pdfRectLeft = Math.min(pdfRectTopLeft[0], pdfRectBottomRight[0]);
      const pdfRectRight = Math.max(pdfRectTopLeft[0], pdfRectBottomRight[0]);
      const pdfRectBottom = Math.min(pdfRectTopLeft[1], pdfRectBottomRight[1]);
      const pdfRectTop = Math.max(pdfRectTopLeft[1], pdfRectBottomRight[1]);

      // pdfTextItem coords are in PDF space (origin at bottom-left)
      const [itemWidth, itemHeight] = [pdfTextItem.width, pdfTextItem.height];
      const [_, __, ___, ____, itemLeft, itemBottom] = pdfTextItem.transform;
      const itemRight = itemLeft + itemWidth;
      const itemTop = itemBottom + itemHeight;

      // Standard 2D box intersection test in PDF coordinate space
      return (
          itemLeft < pdfRectRight &&
          itemRight > pdfRectLeft &&
          itemBottom < pdfRectTop &&
          itemTop > pdfRectBottom
      );
  };

  const getGroupedData = (): GroupedExtractedData[] => {
      // Grouping by page
      const pageGroup: { [key:number]: GroupedExtractedData } = {};
      extractedData.forEach(item => {
          if (!pageGroup[item.page]) {
              pageGroup[item.page] = { page: item.page };
          }
          pageGroup[item.page][item.label] = item.value;
      });

      const grouped = Object.values(pageGroup);

      // Filter out rows that don't have a valid date in 'FECHA ENTREGA'
      // This is a simple validation, might need to be more robust
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const filtered = grouped.filter(row => {
          const fechaEntrega = row['FECHA ENTREGA'] as string;
          return fechaEntrega && dateRegex.test(fechaEntrega);
      });

      return filtered;
  };
  
  const groupedResults = getGroupedData();
  const tableHeaders = ["Página", ...Array.from(new Set(PREDEFINED_RECTANGLES_DEFAULT.map(r => r.label).concat(extractedData.some(d => d.label === 'SKU') ? ['SKU'] : [])))];


  const saveToDatabase = async () => {
    if (groupedResults.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const imp_date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const hour = now.toLocaleTimeString('en-GB'); // HH:MM:SS

      const payload = groupedResults.map((row) => ({
        deli_date: row["FECHA ENTREGA"],
        quantity: Number(row["CANTIDAD"]) || null,
        client: row["CLIENTE INFO"] || null,
        code: row["CODIGO DE BARRA"] || null,
        sales_num: row["NUM DE VENTA"] || null,
        sku: row["SKU"] || null,
        product: row["PRODUCTO"] || null,
        imp_date: imp_date,
        hour: hour,
      }));

      const { error } = await supabase
        .from("etiquetas_i")
        .insert(payload);

      if (error) {
        throw error;
      }

      toast({
        title: "Éxito",
        description: "Etiquetas guardadas correctamente en la base de datos.",
      });

    } catch (e: any) {
        toast({
            variant: "destructive",
            title: "Error al guardar",
            description: e.message || "Ocurrió un error desconocido al guardar en la base de datos.",
        });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div id="qr-reader" style={{ display: 'none' }}></div>
      <div className="container mx-auto max-w-7xl space-y-8">
        <header className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-primary">
                Extractor de Etiquetas de Envío
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
                Sube un archivo PDF para extraer y visualizar la información de las etiquetas automáticamente.
            </p>
        </header>
        <Card>
          <CardContent className="p-6">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="pdf-upload" className="sr-only">Sube tu factura en PDF</Label>
              <Input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
                disabled={isLoading}
              />
              <label
                htmlFor="pdf-upload"
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent transition-colors"
              >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                          <span className="font-semibold text-primary">Haz clic para subir</span> o arrastra y suelta
                      </p>
                      <p className="text-xs text-muted-foreground">Solo archivos PDF</p>
                  </div>
              </label>
            </div>
            {error && <p className="mt-4 text-sm text-destructive font-medium">{error}</p>}
            {qrCodeValue && <p className="mt-4 text-sm text-green-600">Código QR encontrado: {qrCodeValue}</p>}
             {isLoading && <p className="mt-4 text-sm text-primary animate-pulse">Extrayendo o guardando datos...</p>}
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 gap-8">
          {groupedResults.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1" className="border-b-0">
                        <Card>
                           <CardHeader>
                                <div className="flex w-full flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                     <AccordionTrigger className="w-full justify-between">
                                        <CardTitle className="text-xl text-left">Resultados de la Extracción</CardTitle>
                                     </AccordionTrigger>
                                    <Button onClick={saveToDatabase} disabled={isLoading} className="sm:w-auto w-full">
                                        <Database className="mr-2 h-4 w-4" />
                                        Guardar en Base de Datos
                                    </Button>
                                </div>
                            </CardHeader>
                            <AccordionContent>
                               <CardContent>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    {tableHeaders.filter(h => h).map(header => (
                                                        <TableHead key={header} className="font-semibold">{header}</TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {groupedResults.map((row, index) => (
                                                    <TableRow key={index}>
                                                        {tableHeaders.filter(h => h).map(header => (
                                                            <TableCell key={header}>
                                                                {header === "Página" ? row.page : (row[header] as string) || ''}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </AccordionContent>
                        </Card>
                    </AccordionItem>
                </Accordion>
          )}
        </div>

          {pdfDoc && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xl">Vista Previa del PDF</CardTitle>
                  <div className="flex items-center gap-2">
                      <Button onClick={onPrevPage} disabled={pageNum <= 1 || pageRendering} variant="outline" size="icon">
                          <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium tabular-nums">
                          Página {pageNum} de {numPages}
                      </span>
                      <Button onClick={onNextPage} disabled={pageNum >= numPages || pageRendering} variant="outline" size="icon">
                          <ChevronRight className="h-4 w-4" />
                      </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[50vh] w-full rounded-md border overflow-auto flex justify-center items-start relative bg-gray-50 dark:bg-gray-900/50">
                  <div
                    ref={drawingAreaRef}
                    className="absolute top-0 left-0"
                  >
                    <canvas ref={canvasRef}></canvas>
                    {pageNum === 1 && rectangles.map((rect, index) => (
                        <div
                          key={index}
                          className="absolute border-2 border-destructive/70"
                          style={{
                              left: rect.x,
                              top: rect.y,
                              width: rect.width,
                              height: rect.height,
                          }}
                        >
                          <span className="absolute -top-6 left-0 text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-sm shadow-sm">
                            {rect.label}
                          </span>
                          <span className="absolute -bottom-5 left-0 text-xs bg-blue-500 text-white px-1 py-0.5 rounded-sm shadow-sm whitespace-nowrap">
                            x:{rect.x}, y:{rect.y}, w:{rect.width}, h:{rect.height}
                          </span>
                        </div>
                    ))}
                  </div>
                  {pageRendering && <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center font-medium">Cargando...</div>}
                </div>
              </CardContent>
            </Card>
          )}
        
      </div>
    </main>
  );
}

    