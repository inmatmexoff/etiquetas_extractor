"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeft, ChevronRight } from "lucide-react";

// HACK: Make pdfjs work on nextjs
let pdfjsLib: any = null;
if (typeof window !== "undefined") {
  pdfjsLib = (window as any).pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  }
}


export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageRendering, setPageRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);

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
      
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

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

  const handleExtract = async () => {
    if (!pdfFile) {
      setError("Por favor, primero sube un archivo PDF.");
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      console.log("Extraction logic to be implemented.");
    } catch (err: any) {
      console.error("Error durante la extracción:", err);
      setError("Ocurrió un error al extraer la información. Por favor, inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
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


  return (
    <main className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
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
          <CardFooter>
            <Button onClick={handleExtract} disabled={!pdfFile || isLoading}>
              {isLoading ? "Extrayendo..." : "Extraer Información (Próximamente)"}
            </Button>
          </CardFooter>
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
              <div className="h-[80vh] w-full rounded-md border overflow-auto flex justify-center items-start">
                <canvas ref={canvasRef}></canvas>
                {pageRendering && <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">Cargando...</div>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
