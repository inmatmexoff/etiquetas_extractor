
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeft, ChevronRight, Trash2, FileText, RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


// HACK: Make pdfjs work on nextjs
let pdfjsLib: any = null;
if (typeof window !== "undefined") {
  pdfjsLib = (window as any).pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  }
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
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


const PREDEFINED_RECTANGLES: Rectangle[] = [
    { label: "FECHA ENTREGA", x: 291, y: 309, width: 140, height: 37 },
    { label: "CANTIDAD", x: 51, y: 44, width: 83, height: 81 },
    { label: "CLIENTE INFO", x: 45, y: 933, width: 298, height: 123 },
    { label: "CODIGO DE BARRA", x: 52, y: 347, width: 355, height: 167 },
    { label: "NUM DE VENTA", x: 47, y: 165, width: 165, height: 20 },
    { label: "SKU", x: 47, y: 135, width: 384, height: 20 },
    { label: "PRODUCTO", x: 139, y: 52, width: 277, height: 47 },
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

  useEffect(() => {
    // Load predefined rectangles when component mounts
    setRectangles(PREDEFINED_RECTANGLES);
  }, []);

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
        // Reset rectangles to predefined ones for the first page
        setRectangles(PREDEFINED_RECTANGLES);
        setExtractedData([]); // Clear extracted data for new PDF
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

  const handleDeleteRectangle = (index: number) => {
    setRectangles(rectangles.filter((_, i) => i !== index));
  }

  const handleResetRectangles = () => {
    setRectangles(PREDEFINED_RECTANGLES);
  };

  const handleExtractData = async () => {
    if (!pdfDoc || rectangles.length === 0) return;
    setIsLoading(true);
    setExtractedData([]);
    setError(null);

    try {
        const allData: ExtractedData[] = [];

        for (let currentPageNum = 1; currentPageNum <= numPages; currentPageNum++) {
            const page = await pdfDoc.getPage(currentPageNum);
            const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
            const textContent = await page.getTextContent();
            
            const intersects = (pdfTextItem: any, drawnRect: Rectangle) => {
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
            
            for (const rect of rectangles) {
                const itemsInRect = textContent.items.filter((item: any) => intersects(item, rect));

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
                    extractedText = extractedText.replace(/Cantidad/gi, '').trim();
                } else if (rect.label === 'FECHA ENTREGA') {
                    const monthMap: { [key: string]: string } = {
                        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
                        'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
                    };
                    const daysOfWeek = /lunes|martes|miércoles|jueves|viernes|sábado|domingo/gi;
                    
                    let cleanText = extractedText.replace(/ENTREGAR/gi, '').replace(daysOfWeek, '').replace(':', '').trim();
                    
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
                            extractedText = `2025-${month}-${day}`;
                        }
                    }
                } else if (rect.label === 'CODIGO DE BARRA') {
                    const numbers = extractedText.match(/\d{4,}/g);
                    extractedText = numbers ? numbers.join(' ') : '';
                } else if (rect.label === 'NUM DE VENTA') {
                    extractedText = extractedText.replace(/Venta:/gi, '').trim();
                }


                if (extractedText.trim() !== '') {
                    allData.push({ label: rect.label, value: extractedText.trim(), page: currentPageNum });
                }
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

  const getGroupedData = (): GroupedExtractedData[] => {
      // Grouping by page
      const pageGroup: { [key:number]: GroupedExtractedData } = {};
      extractedData.forEach(item => {
          if (!pageGroup[item.page]) {
              pageGroup[item.page] = { page: item.page };
          }
          pageGroup[item.page][item.label] = item.value;
      });

      return Object.values(pageGroup);
  };
  
  const groupedResults = getGroupedData();
  const tableHeaders = ["Página", ...PREDEFINED_RECTANGLES.map(r => r.label)];

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div id="qr-reader" style={{ display: 'none' }}></div>
      <div className="container mx-auto max-w-7xl space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight text-primary">
              Extractor de Facturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid w-full max-w-sm items-center gap-2">
              <Label htmlFor="pdf-upload">Sube tu factura en PDF</Label>
              <Input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="file:text-primary file:font-medium"
                disabled={isLoading}
              />
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            {qrCodeValue && <p className="mt-2 text-sm text-green-600">Código QR encontrado: {qrCodeValue}</p>}
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
              <CardHeader>
                  <CardTitle>Áreas Definidas</CardTitle>
              </CardHeader>
              <CardContent>
                    <ul className="space-y-2">
                      {rectangles.map((rect, index) => (
                          <li key={index} className="flex justify-between items-center bg-muted p-2 rounded-md">
                              <div>
                                  <span className="font-medium">{rect.label}</span>
                                  <p className="text-xs text-muted-foreground">
                                      x: {Math.round(rect.x)}, y: {Math.round(rect.y)}, w: {Math.round(rect.width)}, h: {Math.round(rect.height)}
                                  </p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteRectangle(index)}>
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                          </li>
                      ))}
                  </ul>
              </CardContent>
              <CardFooter className="flex-wrap gap-2">
                  <Button onClick={handleExtractData} disabled={isLoading || !pdfDoc || rectangles.length === 0}>
                      <FileText className="mr-2 h-4 w-4" />
                      {isLoading ? 'Extrayendo...' : 'Extraer Datos de Todas las Páginas'}
                  </Button>
                  <Button onClick={handleResetRectangles} variant="outline">
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restablecer Áreas
                  </Button>
              </CardFooter>
          </Card>
          
          {groupedResults.length > 0 && (
                <Card>
                  <CardHeader>
                      <CardTitle>Resultados de la Extracción</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  {tableHeaders.map(header => (
                                    <TableHead key={header}>{header}</TableHead>
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
                  </CardContent>
              </Card>
          )}
        </div>

          {pdfDoc && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Vista Previa del PDF</CardTitle>
                  <div className="flex items-center gap-2">
                      <Button onClick={onPrevPage} disabled={pageNum <= 1 || pageRendering} variant="outline" size="icon">
                          <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span>
                          Página {pageNum} de {numPages}
                      </span>
                      <Button onClick={onNextPage} disabled={pageNum >= numPages || pageRendering} variant="outline" size="icon">
                          <ChevronRight className="h-4 w-4" />
                      </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[80vh] w-full rounded-md border overflow-auto flex justify-center items-start relative bg-gray-100 dark:bg-gray-900">
                  <div
                    ref={drawingAreaRef}
                    className="absolute top-0 left-0"
                  >
                    <canvas ref={canvasRef}></canvas>
                    {rectangles.map((rect, index) => (
                        <div
                          key={index}
                          className="absolute border-2 border-destructive"
                          style={{
                              left: rect.x,
                              top: rect.y,
                              width: rect.width,
                              height: rect.height,
                          }}
                        >
                          <span className="absolute -top-6 left-0 text-sm bg-destructive text-destructive-foreground px-1 rounded-sm">{rect.label}</span>
                        </div>
                    ))}
                  </div>
                  {pageRendering && <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">Cargando...</div>}
                </div>
              </CardContent>
            </Card>
          )}
        
      </div>
    </main>
  );
}
