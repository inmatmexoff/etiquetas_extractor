
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeft, ChevronRight, UploadCloud, Database, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";


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


const PDF_RENDER_SCALE = 1.5;

export default function TryPage() {
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

  // Drawing state
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number, y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<Rectangle | null>(null);

  // Extraction state
  const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // We don't load predefined rectangles by default anymore on this page
  }, []);

  const handleExtractData = async (doc: any) => {
    if (!doc || rectangles.length === 0) {
        if (rectangles.length === 0) {
            toast({
                variant: "destructive",
                title: "No hay áreas definidas",
                description: "Por favor, dibuja al menos un rectángulo antes de extraer datos.",
            });
        }
        return;
    }
    setIsLoading(true);
    setExtractedData([]);
    setError(null);

    try {
        const allData: ExtractedData[] = [];

        for (let currentPageNum = 1; currentPageNum <= doc.numPages; currentPageNum++) {
            const page = await doc.getPage(currentPageNum);
            const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
            const textContent = await page.getTextContent();
            
            // On this page, we use the dynamically drawn rectangles
            const activeRectangles = rectangles;

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
                
                // Keep the original label from the drawn rectangle
                if (extractedText.trim() !== '') {
                    allData.push({ label: rect.label, value: extractedText.trim(), page: currentPageNum });
                }
            }
        }

        if (allData.length === 0 && rectangles.length > 0) {
             setError("No se pudo extraer texto de ninguna página utilizando las áreas que dibujaste.");
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
        setRectangles([]); // Clear drawn rectangles for new PDF
        // handleExtractData is now called manually via a button
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
      const tx = pdfjsLib.Util.transform(viewport.transform, pdfTextItem.transform);
      const x = tx[4];
      const y = tx[5];

      const textWidth = pdfTextItem.width * PDF_RENDER_SCALE;
      const textHeight = pdfTextItem.height * PDF_RENDER_SCALE;

      const r1 = {
        x: x,
        y: y,
        width: textWidth,
        height: textHeight, 
      };

      const r2 = {
        x: drawnRect.x,
        y: drawnRect.y,
        width: drawnRect.width,
        height: drawnRect.height
      };

      // Check for intersection with tolerance
      const pad = 5;
      return (
        r1.x < r2.x + r2.width + pad &&
        r1.x + r1.width > r2.x - pad &&
        r1.y < r2.y + r2.height + pad &&
        r1.y + r1.height > r2.y - pad
      );
    };

  const getGroupedData = (): GroupedExtractedData[] => {
      const pageGroup: { [key:number]: GroupedExtractedData } = {};
      extractedData.forEach(item => {
          if (!pageGroup[item.page]) {
              pageGroup[item.page] = { page: item.page };
          }
          // Avoid overwriting labels if they appear multiple times on the same page
          if (!pageGroup[item.page][item.label]) {
             pageGroup[item.page][item.label] = item.value;
          }
      });
      return Object.values(pageGroup);
  };
  
  const groupedResults = getGroupedData();
  // Headers are now dynamic based on drawn rectangles
  const tableHeaders = ["Página", ...Array.from(new Set(rectangles.map(r => r.label)))];


  const saveToDatabase = async () => {
    if (groupedResults.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const imp_date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const hour = now.toLocaleTimeString('en-GB'); // HH:MM:SS

      const payload = groupedResults.map((row) => ({
        deli_date: row["FECHA ENTREGA"] || null,
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

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow drawing on the first page
    if (!drawingAreaRef.current || pageNum !== 1 || isDrawing) return;
    setIsDrawing(true);
    const rect = drawingAreaRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    setStartPos({ x, y });
    setCurrentRect({ label: '', x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos || !drawingAreaRef.current || pageNum !== 1) return;
    const rect = drawingAreaRef.current.getBoundingClientRect();
    const currentX = Math.round(e.clientX - rect.left);
    const currentY = Math.round(e.clientY - rect.top);
    
    const width = currentX - startPos.x;
    const height = currentY - startPos.y;

    setCurrentRect({
        label: '',
        x: startPos.x,
        y: startPos.y,
        width: width,
        height: height
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect || pageNum !== 1) return;
    setIsDrawing(false);
    
    // Normalize rectangle in case of drawing backwards
    const finalRect = { ...currentRect };
    if (finalRect.width < 0) {
        finalRect.x = finalRect.x + finalRect.width;
        finalRect.width = -finalRect.width;
    }
    if (finalRect.height < 0) {
        finalRect.y = finalRect.y + finalRect.height;
        finalRect.height = -finalRect.height;
    }


    const label = prompt("Ingresa un nombre para esta área:", `Area_${rectangles.length + 1}`);
    if (label && finalRect.width > 5 && finalRect.height > 5) { // Ensure rect is not too small
      setRectangles(prev => [...prev, { ...finalRect, label }]);
    }
    
    setStartPos(null);
    setCurrentRect(null);
  };


  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div id="qr-reader" style={{ display: 'none' }}></div>
      <div className="container mx-auto max-w-7xl space-y-8">
        <header className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-primary">
                Extractor de Etiquetas de Envío (Modo Prueba)
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
                {pdfDoc && pageNum > 1 ? "El dibujo solo está habilitado en la primera página." : "Dibuja rectángulos en el PDF para definir áreas de extracción."}
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
          {rectangles.length > 0 && (
                <Accordion type="single" collapsible className="w-full" defaultValue="item-1">
                    <AccordionItem value="item-1" className="border-b-0">
                        <Card>
                           <CardHeader>
                                <div className="flex w-full flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                     <AccordionTrigger className="w-full justify-between">
                                        <CardTitle className="text-xl text-left">Resultados de la Extracción</CardTitle>
                                     </AccordionTrigger>
                                     <div className="flex gap-2 w-full sm:w-auto">
                                        <Button onClick={() => handleExtractData(pdfDoc)} disabled={isLoading || !pdfDoc || rectangles.length === 0} className="flex-1 sm:flex-none">
                                            Extraer Datos
                                        </Button>
                                        {groupedResults.length > 0 && (
                                            <Button onClick={saveToDatabase} disabled={isLoading} className="flex-1 sm:flex-none">
                                                <Database className="mr-2 h-4 w-4" />
                                                Guardar
                                            </Button>
                                        )}
                                     </div>
                                </div>
                            </CardHeader>
                            {groupedResults.length > 0 && (
                                <AccordionContent>
                                   <CardContent>
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        {tableHeaders.map(header => (
                                                            <TableHead key={header} className="font-semibold">{header}</TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {groupedResults.map((row, index) => (
                                                        <TableRow key={index}>
                                                            {tableHeaders.map(header => (
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
                            )}
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
                      <Button onClick={() => { setRectangles([]); setExtractedData([]); }} disabled={rectangles.length === 0} variant="destructive" size="sm">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Limpiar Dibujos
                      </Button>
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
                <div 
                    className={cn(
                        "h-[50vh] w-full rounded-md border overflow-auto flex justify-center items-start relative bg-gray-50 dark:bg-gray-900/50",
                         pageNum === 1 ? "cursor-crosshair" : "cursor-default"
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp} // Stop drawing if mouse leaves the area
                >
                  <div
                    ref={drawingAreaRef}
                    className="absolute top-0 left-0"
                    style={{ touchAction: 'none' }} // Improves compatibility
                  >
                    <canvas ref={canvasRef}></canvas>
                    {/* Render user-drawn rectangles for the current page */}
                    {pageNum === 1 && rectangles.map((rect, index) => (
                        <div
                          key={index}
                          className="absolute border-2 border-destructive/70 pointer-events-none"
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
                    {/* Render rectangle being currently drawn */}
                    {isDrawing && currentRect && (
                       <div
                          className="absolute border-2 border-blue-500/70 pointer-events-none"
                          style={{
                              left: currentRect.width > 0 ? currentRect.x : currentRect.x + currentRect.width,
                              top: currentRect.height > 0 ? currentRect.y : currentRect.y + currentRect.height,
                              width: Math.abs(currentRect.width),
                              height: Math.abs(currentRect.height),
                          }}
                        />
                    )}
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
    

    