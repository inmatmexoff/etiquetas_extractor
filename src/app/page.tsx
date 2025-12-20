"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Set up the worker for PDF.js
if (typeof window !== 'undefined') {
  (window as any).pdfjsWorker = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

type Selection = {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  label: string;
};

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number, y: number, page: number } | null>(null);
  const pdfDocRef = useRef<any>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPdfFile(file);
      setSelections([]);
      setNumPages(null);
      pdfDocRef.current = null;
      canvasRefs.current = [];
    }
  };

  const handleAddLabel = () => {
    if (newLabel && !labels.includes(newLabel)) {
      setLabels([...labels, newLabel]);
      setNewLabel("");
    }
  };

  const handleExtract = () => {
    // Placeholder for future OCR/extraction logic
    console.log("Extracting data from selections:", selections);
    alert("La funcionalidad de extracción de texto se implementará en el siguiente paso.");
  };

  const renderPage = async (pageIndex: number) => {
    if (!pdfDocRef.current) return;
    const page = await pdfDocRef.current.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = canvasRefs.current[pageIndex];

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
        drawSelectionsForPage(pageIndex);
      }
    }
  };

  const renderAllPages = async () => {
    if (!pdfDocRef.current) return;
    const numPages = pdfDocRef.current.numPages;
    canvasRefs.current = Array(numPages).fill(null).map((_, i) => canvasRefs.current[i] || null);

    const renderPromises = [];
    for (let i = 0; i < numPages; i++) {
        renderPromises.push(renderPage(i));
    }
    await Promise.all(renderPromises);
  };
  
  useEffect(() => {
    if (!pdfFile || typeof window === 'undefined') return;

    const loadPdf = async () => {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) {
        console.error("PDF.js library not found.");
        return;
      }
      
      const fileReader = new FileReader();
      fileReader.onload = async function() {
        if (!this.result) return;
        const typedArray = new Uint8Array(this.result as ArrayBuffer);
        try {
            const doc = await pdfjsLib.getDocument({ data: typedArray }).promise;
            pdfDocRef.current = doc;
            setNumPages(doc.numPages);
        } catch(error) {
            console.error("Error loading PDF:", error);
        }
      };
      fileReader.readAsArrayBuffer(pdfFile);
    };

    loadPdf();

  }, [pdfFile]);

  useEffect(() => {
    if (numPages) {
        renderAllPages();
    }
  }, [numPages]); 

  useEffect(() => {
    if (pdfDocRef.current) {
        renderAllPages();
    }
  }, [selections]);

  const getCanvasAndMousePos = (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => {
    const canvas = canvasRefs.current[pageIndex];
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { canvas, x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => {
    if (!activeLabel) return;
    const pos = getCanvasAndMousePos(e, pageIndex);
    if (!pos) return;
    setIsDrawing(true);
    setStartPos({ x: pos.x, y: pos.y, page: pageIndex });
  };

  const handleMouseMove = async (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => {
    if (!isDrawing || !startPos || startPos.page !== pageIndex) return;
    const pos = getCanvasAndMousePos(e, pageIndex);
    if (!pos) return;

    await renderPage(pageIndex);
    
    const canvas = canvasRefs.current[pageIndex];
    if(!canvas) return;
    const context = canvas.getContext("2d");
    if(context){
        const width = pos.x - startPos.x;
        const height = pos.y - startPos.y;
        context.strokeStyle = "green";
        context.lineWidth = 2;
        context.strokeRect(startPos.x, startPos.y, width, height);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => {
    if (!isDrawing || !startPos || !activeLabel || startPos.page !== pageIndex) return;
    const pos = getCanvasAndMousePos(e, pageIndex);
    if (!pos) return;

    setIsDrawing(false);
    
    const newSelection: Selection = {
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
      page: pageIndex + 1,
      label: activeLabel,
    };
    
    // Remove existing selection for the same label before adding the new one
    const otherSelections = selections.filter(s => s.label !== activeLabel);
    setSelections([...otherSelections, newSelection]);
    setStartPos(null);
  };
  
  const drawSelectionsForPage = (pageIndex: number) => {
    const canvas = canvasRefs.current[pageIndex];
    if(!canvas) return;
    const context = canvas.getContext('2d');
    if(!context) return;

    const pageSelections = selections.filter(s => s.page === pageIndex + 1);
    pageSelections.forEach(sel => {
        context.strokeStyle = 'green';
        context.lineWidth = 2;
        context.strokeRect(sel.x, sel.y, sel.width, sel.height);
        context.fillStyle = 'rgba(0, 255, 0, 0.1)';
        context.fillRect(sel.x, sel.y, sel.width, sel.height);
        context.font = '12px Arial';
        context.fillStyle = 'green';
        context.fillText(sel.label, sel.x, sel.y > 10 ? sel.y - 2 : sel.y + 10);
    });
  }


  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
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

            <Card>
                <CardHeader>
                    <CardTitle>Etiquetas de Información</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2 mb-4">
                        <Input 
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="Ej: Nombre, Dirección..."
                        />
                        <Button onClick={handleAddLabel}>Añadir</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {labels.map(label => (
                            <Badge 
                                key={label}
                                variant={activeLabel === label ? 'default' : 'secondary'}
                                onClick={() => setActiveLabel(label === activeLabel ? null : label)}
                                className="cursor-pointer"
                            >
                                {label}
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>

        {pdfFile && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <Card>
                  <CardHeader>
                  <CardTitle>Vista Previa del PDF</CardTitle>
                  </CardHeader>
                  <CardContent>
                  <div className="h-full w-full overflow-auto rounded-md border" style={{maxHeight: '80vh'}}>
                      {numPages && Array.from(new Array(numPages), (el, index) => (
                      <canvas
                          key={`page_${index + 1}`}
                          ref={el => canvasRefs.current[index] = el}
                          className="mx-auto my-4 block"
                          onMouseDown={(e) => handleMouseDown(e, index)}
                          onMouseMove={(e) => handleMouseMove(e, index)}
                          onMouseUp={(e) => handleMouseUp(e, index)}
                          style={{ cursor: activeLabel ? 'crosshair' : 'default' }}
                      />
                      ))}
                  </div>
                  </CardContent>
              </Card>
            </div>
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Información Extraída</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {labels.map(label => (
                      <div key={label}>
                        <Label>{label}</Label>
                        <Input
                            readOnly
                            value={"Texto no extraído"}
                            className="bg-muted"
                        />
                      </div>
                    ))}
                  </div>
                  <Button onClick={handleExtract} className="w-full">Extraer Información</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
