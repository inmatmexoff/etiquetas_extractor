
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeft, ChevronRight, Trash2, FileText } from "lucide-react";
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
  page: number;
}

interface ExtractedData {
    label: string;
    value: string;
}

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

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<Omit<Rectangle, "label" | "page"> | null>(null);
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [newLabel, setNewLabel] = useState("");

  // Extraction state
  const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);


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
        setRectangles([]); // Clear rectangles for new PDF
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

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingAreaRef.current) return;
    const rect = drawingAreaRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setIsDrawing(true);
    setStartPoint({ x, y });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || !drawingAreaRef.current) return;
    const rect = drawingAreaRef.current.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    const x = Math.min(startPoint.x, currentX);
    const y = Math.min(startPoint.y, currentY);
    const width = Math.abs(startPoint.x - currentX);
    const height = Math.abs(startPoint.y - currentY);
    setCurrentRect({ x, y, width, height });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setStartPoint(null);
    if (currentRect && currentRect.width > 5 && currentRect.height > 5) {
        // Here we could open a modal to ask for a label
    } else {
        setCurrentRect(null);
    }
  };

  const handleSaveRectangle = () => {
    if (currentRect && newLabel.trim() !== "") {
        setRectangles([...rectangles, { ...currentRect, label: newLabel.trim(), page: pageNum }]);
        setCurrentRect(null);
        setNewLabel("");
    }
  }

  const handleDeleteRectangle = (index: number) => {
    setRectangles(rectangles.filter((_, i) => i !== index));
  }

  const handleExtractData = async () => {
    if (!pdfDoc || rectangles.length === 0) return;
    setIsLoading(true);
    setExtractedData([]);
    setError(null);

    try {
        const data: ExtractedData[] = [];

        for (const rect of rectangles) {
            const page = await pdfDoc.getPage(rect.page);
            const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
            const textContent = await page.getTextContent();
            
            // Function to check if a text item's bounding box intersects with the drawn rectangle
            const intersects = (pdfTextItem: any, drawnRect: Rectangle) => {
                const [fontSize, , , , tx, ty] = pdfTextItem.transform;

                // Convert PDF coordinates to Canvas coordinates
                // tx and ty are the bottom-left corner of the text
                const textX = tx;
                const textY = viewport.height - ty;
                
                const textWidth = pdfTextItem.width;
                // Approximate height, as pdf.js doesn't provide it reliably.
                // We can use the font size as a rough guide.
                const textHeight = pdfTextItem.height;

                // AABB collision detection (Axis-Aligned Bounding Box)
                const rect1 = { x: textX, y: textY - textHeight, width: textWidth, height: textHeight };
                const rect2 = { x: drawnRect.x, y: drawnRect.y, width: drawnRect.width, height: drawnRect.height };

                // Add a small padding for tolerance
                const pad = 5;

                return (
                    rect1.x < rect2.x + rect2.width + pad &&
                    rect1.x + rect1.width > rect2.x - pad &&
                    rect1.y < rect2.y + rect2.height + pad &&
                    rect1.y + rect1.height > rect2.y - pad
                );
            };

            const itemsInRect = textContent.items.filter((item: any) => intersects(item, rect));

            // Sort by y then x to read in a natural order
             itemsInRect.sort((a: any, b: any) => {
                const yA = a.transform[5];
                const yB = b.transform[5];
                if (Math.abs(yA - yB) < 2) { // If on the same line (approx)
                    return a.transform[4] - b.transform[4]; // Sort by X
                }
                return yB - yA; // Sort by Y (descending as PDF coords are bottom-up)
            });

            const extractedText = itemsInRect.map((item: any) => item.str).join(' ');
            data.push({ label: rect.label, value: extractedText.trim() });
        }

        if (data.every(d => d.value === '')) {
             setError("No se pudo extraer texto de las áreas definidas. Revisa las coordenadas y la lógica de intersección.");
             console.log("Rectangles:", rectangles);
             const pageForLog = await pdfDoc.getPage(rectangles[0].page);
             const contentForLog = await pageForLog.getTextContent();
             console.log("PDF Text Content:", contentForLog.items.map((item:any) => ({text: item.str, transform: item.transform, width: item.width, height: item.height })));
        } else {
            setError(null);
        }
        setExtractedData(data);

    } catch(e) {
        console.error("Error extracting data", e);
        setError("Ocurrió un error al extraer los datos.");
    } finally {
        setIsLoading(false);
    }
  }

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
                  className="absolute top-0 left-0 cursor-crosshair"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <canvas ref={canvasRef}></canvas>
                  {rectangles.filter(r => r.page === pageNum).map((rect, index) => (
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
                   {currentRect && (
                        <div
                            className="absolute border-2 border-dashed border-primary"
                            style={{
                                left: currentRect.x,
                                top: currentRect.y,
                                width: currentRect.width,
                                height: currentRect.height,
                            }}
                        />
                    )}
                </div>
                {pageRendering && <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">Cargando...</div>}
              </div>
            </CardContent>
          </Card>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
             {(currentRect || rectangles.length > 0) && (
                <Card>
                    <CardHeader>
                        <CardTitle>Áreas Definidas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {currentRect && (
                            <div className="flex items-center gap-2 mb-4">
                                <Input
                                    placeholder="Etiqueta para la nueva área"
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    className="h-9"
                                />
                                <Button onClick={handleSaveRectangle} size="sm">Guardar</Button>
                                <Button onClick={() => setCurrentRect(null)} variant="ghost" size="sm">Cancelar</Button>
                            </div>
                        )}
                         <ul className="space-y-2">
                            {rectangles.map((rect, index) => (
                                <li key={index} className="flex justify-between items-center bg-muted p-2 rounded-md">
                                    <div>
                                        <span className="font-medium">{rect.label} (Pág. {rect.page})</span>
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
                    <CardFooter>
                        <Button onClick={handleExtractData} disabled={isLoading || rectangles.length === 0}>
                            <FileText className="mr-2 h-4 w-4" />
                            {isLoading ? 'Extrayendo...' : 'Extraer Datos'}
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {extractedData.length > 0 && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Resultados de la Extracción</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Campo</TableHead>
                                    <TableHead>Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {extractedData.map((data, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{data.label}</TableCell>
                                        <TableCell>{data.value}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
        
      </div>
    </main>
  );

    
