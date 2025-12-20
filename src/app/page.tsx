"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Set up the worker for PDF.js
if (typeof window !== 'undefined') {
  (window as any).pdfjsWorker = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPdfFile(file);
    }
  };

  useEffect(() => {
    if (!pdfFile || typeof window === 'undefined') return;

    const renderPdf = async () => {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) {
        console.error("PDF.js library not found.");
        return;
      }
      
      const fileReader = new FileReader();
      fileReader.onload = async function() {
        if (!this.result) return;
        const typedArray = new Uint8Array(this.result as ArrayBuffer);
        const pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;
        setNumPages(pdfDoc.numPages);

        canvasRefs.current = Array(pdfDoc.numPages).fill(null);

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = canvasRefs.current[i-1];
          if (canvas) {
            const context = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            if (context) {
              const renderContext = {
                canvasContext: context,
                viewport: viewport,
              };
              await page.render(renderContext).promise;
            }
          }
        }
      };
      fileReader.readAsArrayBuffer(pdfFile);
    };

    renderPdf();

  }, [pdfFile]);

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight text-primary">
              Extractor de Información de PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid w-full max-w-sm items-center gap-2">
              <Label htmlFor="pdf-upload">Sube tu archivo PDF</Label>
              <Input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="file:text-primary file:font-medium"
              />
            </div>
          </CardContent>
        </Card>

        {pdfFile && (
          <Card>
            <CardHeader>
              <CardTitle>Vista Previa del PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[calc(100vh-20rem)] w-full overflow-auto rounded-md border">
                {numPages && Array.from(new Array(numPages), (el, index) => (
                  <canvas
                    key={`page_${index + 1}`}
                    ref={el => canvasRefs.current[index] = el}
                    className="mx-auto my-4 block"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
