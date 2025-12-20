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
    }
  };

  const handleAddLabel = () => {
    if (newLabel && !labels.includes(newLabel)) {
      setLabels([...labels, newLabel]);
      setNewLabel("");
    }
  };

  const renderPdf = async () => {
      if (!pdfDocRef.current) return;
      const pdfDoc = pdfDocRef.current;
      
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
            drawSelectionsForPage(i-1);
          }
        }
      }
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
    if(numPages) {
        renderPdf();
    }
  }, [numPages, selections]);


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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => {
    if (!isDrawing || !startPos || startPos.page !== pageIndex) return;
    const pos = getCanvasAndMousePos(e, pageIndex);
    if (!pos) return;

    renderPdf().then(() => {
        const canvas = canvasRefs.current[pageIndex];
        if(!canvas) return;
        const context = canvas.getContext("2d");
        if(context){
            const width = pos.x - startPos.x;
            const height = pos.y - startPos.y;
            context.strokeStyle = "red";
            context.lineWidth = 2;
            context.strokeRect(startPos.x, startPos.y, width, height);
        }
    })
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

    setSelections([...selections, newSelection]);
    setStartPos(null);
  };
  
  const drawSelectionsForPage = (pageIndex: number) => {
    const canvas = canvasRefs.current[pageIndex];
    if(!canvas) return;
    const context = canvas.getContext('2d');
    if(!context) return;

    const pageSelections = selections.filter(s => s.page === pageIndex + 1);
    pageSelections.forEach(sel => {
        context.strokeStyle = 'blue';
        context.lineWidth = 2;
        context.strokeRect(sel.x, sel.y, sel.width, sel.height);
        context.fillStyle = 'rgba(0, 0, 255, 0.1)';
        context.fillRect(sel.x, sel.y, sel.width, sel.height);
        context.font = '12px Arial';
        context.fillStyle = 'blue';
        context.fillText(sel.label, sel.x, sel.y > 10 ? sel.y - 2 : sel.y + 10);
    });
  }


  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-8">
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
                                onClick={() => setActiveLabel(label)}
                                className="cursor-pointer"
                            >
                                {label}
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>

        <div className="md:col-span-2">
            {pdfFile && (
            <Card>
                <CardHeader>
                <CardTitle>Vista Previa del PDF</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="h-[calc(100vh-10rem)] w-full overflow-auto rounded-md border">
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
            )}
        </div>
      </div>
    </main>
  );
}
