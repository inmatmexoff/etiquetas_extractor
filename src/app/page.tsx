

"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeft, ChevronRight, UploadCloud, Database, Trash2, PlusCircle, Save, Download, FileText, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


// HACK: Make pdfjs work on nextjs
let pdfjsLib: any = null;
if (typeof window !== "undefined") {
  pdfjsLib = (window as any).pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  }
}

interface Rectangle {
  id: number;
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
    labelGroup: number;
}

type GroupedExtractedData = {
    'Página': number;
    'LISTADO'?: number;
    labelGroup: number;
    [key: string]: string | number | undefined;
};


const PDF_RENDER_SCALE = 1.5;

const TRY_PAGE_RECTANGLES_DEFAULT: Omit<Rectangle, 'id'>[] = [
    // Primera etiqueta
    { label: "FECHA ENTREGA", x: 193, y: 311, width: 238, height: 33 },
    { label: "CANTIDAD", x: 69, y: 96, width: 50, height: 69 },
    { label: "CLIENTE INFO", x: 48, y: 933, width: 291, height: 119 },
    { label: "CODIGO DE BARRA", x: 144, y: 445, width: 154, height: 30 },
    { label: "NUM DE VENTA", x: 53, y: 51, width: 168, height: 25 },
    { label: "PRODUCTO", x: 156, y: 88, width: 269, height: 60 },
    // Segunda etiqueta
    { label: "FECHA ENTREGA 2", x: 586, y: 311, width: 238, height: 33 },
    { label: "CANTIDAD 2", x: 462, y: 96, width: 50, height: 69 },
    { label: "CLIENTE INFO 2", x: 441, y: 933, width: 291, height: 119 },
    { label: "CODIGO DE BARRA 2", x: 537, y: 445, width: 154, height: 30 },
    { label: "NUM DE VENTA 2", x: 446, y: 51, width: 168, height: 25 },
    { label: "PRODUCTO 2", x: 549, y: 88, width: 269, height: 60 },
];

const COMPANIES = ["HOGARDEN", "TAL", "MTM", "PALO DE ROSA", "DOMESKA", "TOLEXAL"];

const MEXICAN_STATES = [
    "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
    "Chihuahua", "Coahuila", "Colima", "Durango", "Guanajuato", "Guerrero",
    "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León",
    "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa",
    "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
    "Ciudad de México", "Estado de México"
];


export default function TryPage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfThumbnail, setPdfThumbnail] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [numPages, setNumPages] = useState(0);
  const [pageRendering, setPageRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingAreaRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [printerName, setPrinterName] = useState<string>("");


  // Drawing state
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number, y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<Omit<Rectangle, 'id' | 'label'> & { label: string } | null>(null);

  // Manual input state
  const [manualRect, setManualRect] = useState({ label: '', x: '', y: '', width: '', height: '' });


  // Extraction state
  const [extractedData, setExtractedData] = useState<GroupedExtractedData[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Load predefined rectangles for this page on mount
    const initialRects = TRY_PAGE_RECTANGLES_DEFAULT.map((rect, index) => ({
      ...rect,
      id: Date.now() + index,
    }));
    setRectangles(initialRects);
  }, []);

  const getDeliveryDateFromFirstPage = async (doc: any): Promise<{ dbFormat: string; displayFormat: string } | null> => {
    if (!doc) return null;
    try {
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        const textContent = await page.getTextContent();
        const dateRect = rectangles.find(r => r.label === 'FECHA ENTREGA');
        if (!dateRect) return null;

        const itemsInRect = textContent.items.filter((item: any) => intersects(item, dateRect, viewport));
        itemsInRect.sort((a: any, b: any) => {
            const yA = a.transform[5];
            const yB = b.transform[5];
            if (Math.abs(yA - yB) < 2) return a.transform[4] - b.transform[4];
            return yB - yA;
        });

        let extractedText = itemsInRect.map((item: any) => item.str).join(' ');

        const timeRegex = /antes de \d{1,2}:\d{2} hs/i;
        extractedText = extractedText.replace(timeRegex, '').trim();

        const monthMap: { [key: string]: string } = {
            'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
            'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
        };
        const daysOfWeek = /lunes|martes|miércoles|jueves|viernes|sábado|domingo/gi;
        let cleanText = extractedText.replace(/ENTREGAR:|ENTREGAR/gi, '').replace(daysOfWeek, '').replace(':', '').trim();

        const datePartsNumeric = cleanText.split('/');
        let dbFormat: string | null = null;

        if (datePartsNumeric.length === 3) { // DD/MM/YYYY
            const day = datePartsNumeric[0].padStart(2, '0');
            const month = datePartsNumeric[1].padStart(2, '0');
            const year = datePartsNumeric[2];
            dbFormat = `${year}-${month}-${day}`;
        } else if (datePartsNumeric.length >= 2) { // DD/mon
            const day = datePartsNumeric[0].padStart(2, '0');
            const monthStr = datePartsNumeric[1].toLowerCase().substring(0, 3);
            const month = monthMap[monthStr];
            if (month) {
                const currentYear = new Date().getFullYear();
                dbFormat = `${currentYear}-${month}-${day}`;
            }
        }
        
        if (dbFormat) {
            dbFormat = dbFormat.replace(/[^0-9-]/g, '').slice(0, 10);
            const parts = dbFormat.split('-').map(part => parseInt(part, 10));
            if (parts.length === 3 && !parts.some(isNaN)) {
                const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                const dayOfWeekStr = dateObj.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
                const displayFormat = `${dbFormat}-${dayOfWeekStr} ${parts[2]}`;
                return { dbFormat, displayFormat };
            }
        }
    } catch(e) {
        console.error("Error getting delivery date:", e);
    }

    return null;
  };


  const handleExtractData = async (doc: any) => {
    if (!doc || rectangles.length === 0) {
        if (rectangles.length === 0) {
            toast({
                variant: "destructive",
                title: "No hay áreas definidas",
                description: "Por favor, dibuja o añade al menos un rectángulo antes de extraer datos.",
            });
        }
        return;
    }
    if (!selectedCompany) {
        toast({
            variant: "destructive",
            title: "No se ha seleccionado una empresa",
            description: "Por favor, selecciona una empresa antes de extraer los datos.",
        });
        return;
    }
    setIsLoading(true);
    setExtractedData([]);
    setError(null);

    try {
        const deliveryDateInfo = await getDeliveryDateFromFirstPage(doc);
        
        if (!deliveryDateInfo?.dbFormat) {
            throw new Error("No se pudo determinar la fecha de entrega desde la primera página. Asegúrate de que el área 'FECHA ENTREGA' esté definida correctamente.");
        }
        
        const allGroupedData: GroupedExtractedData[] = [];
        const preliminaryData: any[] = [];

        // --- Step 1: Preliminary data extraction to get all codes ---
        for (let currentPageNum = 1; currentPageNum <= doc.numPages; currentPageNum++) {
            const page = await doc.getPage(currentPageNum);
            const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
            const textContent = await page.getTextContent();
            
            const activeRectangles = rectangles;
            
            const pageLabelData: { [key: number]: { [key: string]: string | number } } = { 1: {}, 2: {} };

            for (const rect of activeRectangles) {
                if (rect.width === 0 && rect.height === 0) continue;

                const itemsInRect = textContent.items.filter((item: any) => intersects(item, rect, viewport));
                itemsInRect.sort((a: any, b: any) => {
                    const yA = a.transform[5]; const yB = b.transform[5];
                    if (Math.abs(yA - yB) < 2) { return a.transform[4] - b.transform[4]; }
                    return yB - yA;
                });
                let extractedText = itemsInRect.map((item: any) => item.str).join(' ');
                
                const isSecondLabel = rect.label.endsWith(' 2');
                const labelGroup = isSecondLabel ? 2 : 1;
                const cleanLabel = rect.label.replace(' 2', '').trim();

                if (cleanLabel.includes('CODIGO DE BARRA')) {
                    const numbers = extractedText.match(/\d+/g);
                    extractedText = numbers ? numbers.join('') : '';
                }

                if (extractedText.trim() !== '') {
                   pageLabelData[labelGroup][cleanLabel] = extractedText.trim();
                   pageLabelData[labelGroup].labelGroup = labelGroup;
                }
            }
            for (const group of [1, 2]) {
                 if (Object.keys(pageLabelData[group]).length > 1 && pageLabelData[group]['CODIGO DE BARRA']) {
                     preliminaryData.push({
                         page: currentPageNum,
                         labelGroup: group,
                         code: Number(pageLabelData[group]['CODIGO DE BARRA']) || null
                     });
                 }
            }
        }
        
        const codesToCheck = preliminaryData.map(d => d.code).filter(c => c);

        let existingFolios: { [key: number]: number } = {};
        let listadoCounter = 0;

        if (codesToCheck.length > 0) {
            const { data: existingData, error: checkError } = await supabase
                .from('etiquetas_i')
                .select('code, folio')
                .eq('organization', selectedCompany)
                .eq('deli_date', deliveryDateInfo.dbFormat)
                .in('code', codesToCheck);

            if (checkError) throw new Error(`Error al verificar etiquetas existentes: ${checkError.message}`);

            if (existingData && existingData.length > 0) {
                existingData.forEach(d => {
                    if (d.code && d.folio) {
                        existingFolios[d.code] = d.folio;
                    }
                });
            }
        }
        
        if (Object.keys(existingFolios).length === 0) { // If no labels are found, start new folio count
            const { data: lastEntry, error: dbError } = await supabase
                .from('etiquetas_i')
                .select('folio')
                .eq('organization', selectedCompany)
                .eq('deli_date', deliveryDateInfo.dbFormat)
                .order('folio', { ascending: false })
                .limit(1)
                .single();

            if (dbError && dbError.code !== 'PGRST116') {
                throw new Error(`Error al consultar el último folio: ${dbError.message}`);
            }
            listadoCounter = (lastEntry?.folio || 0) + 1;
        }


        // --- Step 2: Full data extraction and folio assignment ---
        for (let currentPageNum = 1; currentPageNum <= doc.numPages; currentPageNum++) {
            const page = await doc.getPage(currentPageNum);
            const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
            const textContent = await page.getTextContent();
            
            const activeRectangles = rectangles;
            
            const pageLabelData: { [key: number]: { [key: string]: string | number } } = { 1: {}, 2: {} };

            for (const rect of activeRectangles) {
                 if (rect.width === 0 && rect.height === 0) continue;
                const itemsInRect = textContent.items.filter((item: any) => intersects(item, rect, viewport));
                itemsInRect.sort((a: any, b: any) => {
                    const yA = a.transform[5]; const yB = b.transform[5];
                    if (Math.abs(yA - yB) < 2) { return a.transform[4] - b.transform[4]; }
                    return yB - yA;
                });
                let extractedText = itemsInRect.map((item: any) => item.str).join(' ');
                
                const isSecondLabel = rect.label.endsWith(' 2');
                const labelGroup = isSecondLabel ? 2 : 1;
                const cleanLabel = rect.label.replace(' 2', '').trim();

                if (cleanLabel.includes('CANTIDAD')) {
                    extractedText = extractedText.replace(/Cantidad|Productos|Unidad(es)?/gi, '').trim();
                } else if (cleanLabel.includes('FECHA ENTREGA')) {
                     const timeRegex = /antes de \d{1,2}:\d{2} hs/i;
                     const timeMatch = extractedText.match(timeRegex);
                     if (timeMatch) {
                         pageLabelData[labelGroup]['HORA ENTREGA'] = timeMatch[0];
                         extractedText = extractedText.replace(timeMatch[0], '').trim();
                     }
                     const monthMap: { [key: string]: string } = { 'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12' };
                     const daysOfWeek = /lunes|martes|miércoles|jueves|viernes|sábado|domingo/gi;
                     let cleanText = extractedText.replace(/ENTREGAR:|ENTREGAR/gi, '').replace(daysOfWeek, '').replace(':', '').trim();
                     const datePartsNumeric = cleanText.split('/');
                     let dbFormat: string | null = null;
                     if (datePartsNumeric.length === 3) {
                         dbFormat = `${datePartsNumeric[2]}-${datePartsNumeric[1].padStart(2, '0')}-${datePartsNumeric[0].padStart(2, '0')}`;
                     } else if (datePartsNumeric.length >= 2) {
                         const month = monthMap[datePartsNumeric[1].toLowerCase().substring(0,3)];
                         if (month) dbFormat = `${new Date().getFullYear()}-${month}-${datePartsNumeric[0].padStart(2, '0')}`;
                     }
                    if (dbFormat) {
                        dbFormat = dbFormat.replace(/[^0-9-]/g, '').slice(0, 10);
                        pageLabelData[labelGroup]['FECHA ENTREGA'] = dbFormat;
                        const parts = dbFormat.split('-').map(part => parseInt(part, 10));
                        if (parts.length === 3 && !parts.some(isNaN)) {
                            const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                            const dayOfWeekStr = dateObj.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
                            pageLabelData[labelGroup]['FECHA ENTREGA (Display)'] = `${dbFormat}-${dayOfWeekStr} ${parts[2]}`;
                        }
                    } else {
                        pageLabelData[labelGroup]['FECHA ENTREGA'] = deliveryDateInfo.dbFormat;
                        pageLabelData[labelGroup]['FECHA ENTREGA (Display)'] = deliveryDateInfo.displayFormat;
                    }
                    extractedText = (pageLabelData[labelGroup]['FECHA ENTREGA'] as string) || '';
                } else if (cleanLabel.includes('NUM DE VENTA')) {
                    extractedText = extractedText.replace(/Pack ID:/gi, '').match(/\d+/g)?.join('') || '';
                } else if (cleanLabel.includes('CODIGO DE BARRA')) {
                    extractedText = extractedText.match(/\d+/g)?.join('') || '';
                } else if (cleanLabel.includes('PRODUCTO')) {
                    const skuMatch = extractedText.match(/SKU:\s*(\S+)/);
                    if (skuMatch?.[1]) {
                        pageLabelData[labelGroup]['SKU'] = skuMatch[1];
                        extractedText = extractedText.replace(skuMatch[0], '').trim();
                    }
                } else if (cleanLabel.includes('CLIENTE INFO')) {
                    const fullText = extractedText;
                    const cpMatch = fullText.match(/CP:\s*(\S+)/);
                    if (cpMatch?.[1]) pageLabelData[labelGroup]['CP'] = cpMatch[1].replace(/,/g, '');
                    const clientMatch = fullText.match(/^(.*?)\s*\(/);
                    if (clientMatch?.[1]) pageLabelData[labelGroup]['CLIENTE'] = clientMatch[1].trim();
                    
                    let addressText = domicilioIndex !== -1 ? fullText.substring(fullText.search(/domicilio:/i) + 10) : fullText;
                    var domicilioIndex = addressText.search(/domicilio:/i);

                    let foundState = '', stateIndex = -1;
                    for (const state of [...MEXICAN_STATES].sort((a, b) => b.length - a.length)) {
                        const match = addressText.match(new RegExp(`\\b${state}\\b`, 'i'));
                        if (match?.index !== undefined && match.index > stateIndex) {
                            foundState = match[0]; stateIndex = match.index;
                        }
                    }
                    if (foundState) {
                        pageLabelData[labelGroup]['ESTADO'] = foundState;
                        const cityMatch = addressText.match(new RegExp(`([^,]+),\\s*${foundState.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
                        let extractedCity = cityMatch?.[1] ? cityMatch[1].trim() : (addressText.match(new RegExp(`\\b${foundState}\\b`, 'ig'))?.length || 0) > 1 ? foundState : '';
                        pageLabelData[labelGroup]['CIUDAD'] = extractedCity.length > 30 || extractedCity.toLowerCase().includes('domicilio') ? foundState : extractedCity || foundState;
                    }
                    extractedText = fullText;
                }
                if (extractedText.trim() !== '') {
                   pageLabelData[labelGroup][cleanLabel] = extractedText.trim();
                   pageLabelData[labelGroup].labelGroup = labelGroup;
                }
            }
            
            for (const group of [1, 2]) {
                 if (Object.keys(pageLabelData[group]).length > 1 && pageLabelData[group]['CP']) {
                     if (!pageLabelData[group]['ESTADO']) {
                         pageLabelData[group]['ESTADO'] = "San Luis Potosí";
                         if (!pageLabelData[group]['CIUDAD']) pageLabelData[group]['CIUDAD'] = "San Luis Potosí";
                     }
                    
                     const code = Number(pageLabelData[group]['CODIGO DE BARRA']);
                     const folio = existingFolios[code] || (listadoCounter > 0 ? listadoCounter++ : 0);

                     const rowData: GroupedExtractedData = {
                         'LISTADO': folio,
                         'Página': currentPageNum,
                         'EMPRESA': selectedCompany,
                         ...pageLabelData[group]
                     };

                    if (!rowData['FECHA ENTREGA (Display)']) {
                        const dateStr = rowData['FECHA ENTREGA'] as string;
                        if (dateStr) {
                            const parts = dateStr.split('-').map(part => parseInt(part, 10));
                            if (parts.length === 3 && !parts.some(isNaN)) {
                                const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                                const dayOfWeekStr = dateObj.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
                                rowData['FECHA ENTREGA (Display)'] = `${dateStr}-${dayOfWeekStr} ${parts[2]}`;
                            }
                        }
                    }
                     allGroupedData.push(rowData);
                 }
            }
        }

        if (allGroupedData.length === 0 && rectangles.length > 0) {
             setError("No se pudo extraer texto de ninguna página utilizando las áreas que definiste o no se encontró el CP.");
        } else {
            setError(null);
        }
        allGroupedData.sort((a,b) => (a['LISTADO'] || 0) < (b['LISTADO'] || 0) ? -1 : 1);
        setExtractedData(allGroupedData);

    } catch(e: any) {
        console.error("Error extracting data", e);
        setError(`Ocurrió un error al extraer los datos: ${e.message}`);
        toast({
            variant: "destructive",
            title: "Error de extracción",
            description: e.message || "Ocurrió un error desconocido.",
        });
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
            setPageInput("1");
            setExtractedData([]);

            // Generate thumbnail
            const page = await doc.getPage(1);
            const viewport = page.getViewport({ scale: 0.2 }); // Small scale for thumbnail
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            if (context) {
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              setPdfThumbnail(canvas.toDataURL());
            }

        } catch (err) {
            console.error("Error loading PDF:", err);
            setError("No se pudo cargar el archivo PDF.");
            resetPdfState();
        }
    };
    reader.readAsArrayBuffer(pdfFile);

    const fileForScanner = new File([pdfFile], pdfFile.name, { type: pdfFile.type });
    scanQrCode(fileForScanner);
  }, [pdfFile]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(pageNum);
      setPageInput(String(pageNum));
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
    } else {
      resetPdfState();
      setError("Por favor, sube un archivo PDF válido.");
    }
  };
  
  const resetPdfState = () => {
      setPdfFile(null);
      setPdfDoc(null);
      setPdfThumbnail(null);
      setQrCodeValue(null);
      setExtractedData([]);
      setNumPages(0);
      setPageNum(1);
  }

  const scanQrCode = async (file: File) => {
    try {
      const html5QrCode = new Html5Qrcode("qr-reader", /* verbose= */ false);
      const decodedText = await html5QrCode.scanFile(file, /* showImage= */ false);
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

  const handlePageInputChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          const newPageNum = parseInt(pageInput, 10);
          if (newPageNum >= 1 && newPageNum <= numPages) {
              setPageNum(newPageNum);
          } else {
              setPageInput(String(pageNum)); // Reset to current page if invalid
          }
      }
  };

  const intersects = (pdfTextItem: any, drawnRect: Omit<Rectangle, "id">, viewport: any) => {
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
     return extractedData;
  };

  
  const groupedResults = getGroupedData();
  
  const baseHeaders = Array.from(new Set(rectangles.map(r => r.label.replace(/ 2$/, '').trim())));
  let allHeaders = ["LISTADO", "Página", "EMPRESA", ...baseHeaders];
  // Dynamically add new columns if they exist in any result
  const dynamicHeaders = ['SKU', 'CP', 'CLIENTE', 'CIUDAD', 'ESTADO', 'HORA ENTREGA', 'FECHA ENTREGA (Display)'];
  dynamicHeaders.forEach(header => {
      if (groupedResults.some(row => row[header])) {
          if (!allHeaders.includes(header)) {
              allHeaders.push(header);
          }
      }
  });

  const handleDownloadModifiedPdf = async () => {
      if (!pdfDoc) {
          toast({ variant: "destructive", title: "No hay PDF cargado" });
          return;
      }
      if (!selectedCompany) {
          toast({ variant: "destructive", title: "Selecciona una empresa" });
          return;
      }
      if (groupedResults.length === 0) {
          toast({ variant: "destructive", title: "No hay datos extraídos", description: "Extrae los datos primero para saber qué etiquetas enumerar." });
          return;
      }
      if (!printerName) {
        toast({ variant: "destructive", title: "Falta nombre", description: "Por favor, introduce el nombre de quien imprime." });
        return;
      }
  
      setIsLoading(true);
      try {
          const pdf = new jsPDF({
              orientation: "p",
              unit: "pt",
              format: "letter",
          });
  
          const resultsByPage: { [key: number]: GroupedExtractedData[] } = {};
          groupedResults.forEach(result => {
              const pageKey = result['Página'];
              if (!resultsByPage[pageKey]) {
                  resultsByPage[pageKey] = [];
              }
              resultsByPage[pageKey].push(result);
          });
  
          const logoImage = new Image();
          let logoSrc = `/logos/${selectedCompany}.png`;
          if (selectedCompany === 'MTM') {
            logoSrc = `/logos/INMATMEX.png`;
          } else if (selectedCompany === 'PALO DE ROSA') {
            logoSrc = `/logos/PALODEROSA.png`;
          }
          logoImage.src = logoSrc;
          
          await new Promise((resolve, reject) => {
              logoImage.onload = resolve;
              logoImage.onerror = (err) => {
                  console.error("Failed to load logo", err);
                  resolve(null);
              };
          });

          const companyPhones: { [key: string]: string } = {
            "PALO DE ROSA": "777 522 9204",
            "TOLEXAL": "735 279 0563",
            "MTM": "735 252 7148",
            "DOMESKA": "735 252 7148",
            "TAL": "735 252 7148"
          };
          const phoneNumber = companyPhones[selectedCompany];
  
          let lastEnumeratedPage = 0;

          for (let i = 1; i <= pdfDoc.numPages; i++) {
              const page = await pdfDoc.getPage(i);
              const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) continue;
  
              canvas.width = viewport.width;
              canvas.height = viewport.height;
  
              await page.render({ canvasContext: ctx, viewport }).promise;
              
              const pageResults = resultsByPage[i];
  
              if (pageResults) {
                  lastEnumeratedPage = i;
                  for (const result of pageResults) {
                      
                      let textColor: string = '#000000'; // Default black
                      const dateStr = result['FECHA ENTREGA'] as string;
                      if (dateStr) {
                          const sanitizedDateStr = dateStr.replace(/[^\d-]/g, '');
                          const parts = sanitizedDateStr.split('-').map(part => parseInt(part, 10));
                          if (parts.length === 3 && !parts.some(isNaN)) {
                              const deliveryDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                              if (!isNaN(deliveryDate.getTime())) {
                                  const dayOfWeek = deliveryDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
                                  const colors = [
                                      '#FFA500', // Sunday - Orange
                                      '#0000FF', // Monday - Blue
                                      '#000000', // Tuesday - Black
                                      '#008000', // Wednesday - Green
                                      '#800080', // Thursday - Purple
                                      '#FF0000', // Friday - Red
                                      '#FFA500', // Saturday - Orange
                                  ];
                                  textColor = colors[dayOfWeek];
                              }
                          }
                      }
                      
                      const safeTextColor = textColor || '#000000';
                      ctx.fillStyle = safeTextColor;
                      ctx.textAlign = "center";
                      
                      const listadoCounter = result['LISTADO'];
                      const labelGroup = result.labelGroup;
  
                      let x;
                      const baseL1X = 360;
                      const baseL2X = 753;

                      if (labelGroup === 1) {
                        x = baseL1X;
                      } else { // labelGroup === 2
                        x = baseL2X;
                      }
                      
                      let companyFontSize;
                      if (selectedCompany === 'PALO DE ROSA') {
                          companyFontSize = 18;
                      } else if (['DOMESKA', 'HOGARDEN'].includes(selectedCompany)) {
                          companyFontSize = 20;
                      } else {
                          companyFontSize = 30;
                      }

                      ctx.font = `bold 30px Arial`;
                      ctx.fillText(`${listadoCounter}`, x, 260);

                      ctx.font = `bold ${companyFontSize}px Arial`;
                      ctx.fillText(selectedCompany, x, 290);

                      if (logoImage.complete && logoImage.naturalWidth > 0) {
                          let logoWidth = 130;
                          if (selectedCompany === 'MTM' || selectedCompany === 'HOGARDEN') {
                            logoWidth = 150;
                          }
                          const logoHeight = logoImage.height * (logoWidth / logoImage.width);
                          let logoX, logoY;
                          if (labelGroup === 1) {
                              logoX = 170;
                              logoY = 530;
                          } else { // labelGroup === 2
                              logoX = 563;
                              logoY = 530;
                          }
                          
                          if (selectedCompany === 'PALO DE ROSA') {
                            logoY -= 25;
                          }

                          ctx.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);

                          if (phoneNumber) {
                              ctx.font = `bold 24px Arial`;
                              ctx.fillStyle = '#000000'; // Always black for phone number
                              ctx.fillText(phoneNumber, logoX + logoWidth / 2, 650);
                          }
                      }
                  }
              }
              
              const imgData = canvas.toDataURL("image/jpeg", 0.7);
              
              if (i > 1) {
                  pdf.addPage();
              }
              
              const pdfWidth = pdf.internal.pageSize.getWidth();
              const pdfHeight = pdf.internal.pageSize.getHeight();
              pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
          }

          // Add summary page
          if (groupedResults.length > 0) {
            const summaryPageNumber = lastEnumeratedPage + 1;
            
            if (summaryPageNumber <= pdfDoc.numPages) {
                pdf.setPage(summaryPageNumber);
            } else {
                 pdf.addPage();
            }

            const now = new Date();

            const firstResultDateStr = groupedResults[0]['FECHA ENTREGA'] as string;
            let deliveryDateForSummary: Date | null = null;
            let textColor = '#000000';
            if(firstResultDateStr) {
                 const sanitizedDateStr = firstResultDateStr.replace(/[^\d-]/g, '');
                 const parts = sanitizedDateStr.split('-').map(part => parseInt(part, 10));
                 if(parts.length === 3 && !parts.some(isNaN)) {
                     deliveryDateForSummary = new Date(Date.UTC(parts[0], parts[1]-1, parts[2]));
                     const dayOfWeek = deliveryDateForSummary.getUTCDay();
                      const colors = [
                          '#FFA500', // Sunday - Orange
                          '#0000FF', // Monday - Blue
                          '#000000', // Tuesday - Black
                          '#008000', // Wednesday - Green
                          '#800080', // Thursday - Purple
                          '#FF0000', // Friday - Red
                          '#FFA500', // Saturday - Orange
                      ];
                      textColor = colors[dayOfWeek];
                 }
            }
            
            const dayOfWeek = deliveryDateForSummary 
                ? deliveryDateForSummary.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' }) 
                : 'N/A';
            
            const date = now.toLocaleDateString('es-ES');
            const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

            const firstListado = groupedResults[0]['LISTADO'];
            const lastListado = groupedResults[groupedResults.length - 1]['LISTADO'];
            
            let deliveryDateStr = groupedResults[0]['FECHA ENTREGA (Display)'] as string || groupedResults[0]['FECHA ENTREGA'] as string;
            // Clean the display string for the DB query error
            if (deliveryDateStr) {
                deliveryDateStr = deliveryDateStr.replace(/-\w{3} \d{2}$/, '');
            }


            pdf.setFontSize(10);
            const safeTextColor = textColor || '#000000';
            const rgb = safeTextColor.substring(1).match(/.{1,2}/g)?.map(hex => parseInt(hex, 16)) || [0,0,0];
            pdf.setTextColor(rgb[0], rgb[1], rgb[2]);

            const lineSpacing = 13;
            let currentY = 20;
            const leftX = 40;
            const rightX = 300;

            pdf.text(`Etiquetas Impresas: ${groupedResults.length}`, leftX, currentY);
            currentY += lineSpacing;
            pdf.text(`Empresa: ${selectedCompany}`, leftX, currentY);
            currentY += lineSpacing;
            pdf.text(`Listado: ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} (${firstListado}-${lastListado})`, leftX, currentY);
            
            let rightY = 20;
            pdf.text(`Entrega: ${deliveryDateStr || 'N/A'}`, rightX, rightY);
            rightY += lineSpacing;
            pdf.text(`Imprimió: ${printerName}, ${time}, ${date}`, rightX, rightY);
          }
  
          pdf.save("etiquetas_modificadas.pdf");
          toast({ title: "PDF modificado generado" });
  
      } catch (e: any) {
          console.error(e);
          toast({ variant: "destructive", title: "Error al generar el PDF modificado", description: e.message || "No se pudo generar el PDF." });
      } finally {
          setIsLoading(false);
      }
  };


  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingAreaRef.current || pageNum !== 1 || isDrawing) return;
    if ((e.target as HTMLElement).closest('.drawn-rectangle')) return;

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
    
    let finalRect = { ...currentRect };
    if (finalRect.width < 0) {
        finalRect.x = finalRect.x + finalRect.width;
        finalRect.width = -finalRect.width;
    }
    if (finalRect.height < 0) {
        finalRect.y = finalRect.y + finalRect.height;
        finalRect.height = -finalRect.height;
    }

    if (finalRect.width < 5 || finalRect.height < 5) {
        setStartPos(null);
        setCurrentRect(null);
        return;
    }
    
    setManualRect({
        label: manualRect.label, // keep existing label
        x: String(finalRect.x),
        y: String(finalRect.y),
        width: String(finalRect.width),
        height: String(finalRect.height),
    });
    
    setStartPos(null);
    setCurrentRect(null);
  };
  
  const handleManualAdd = () => {
    const { label, x, y, width, height } = manualRect;
    if (label && x && y && width && height) {
        const newRect: Rectangle = {
            id: Date.now(),
            label,
            x: parseInt(x, 10),
            y: parseInt(y, 10),
            width: parseInt(width, 10),
            height: parseInt(height, 10),
        };
        setRectangles(prev => [...prev, newRect]);
        setManualRect({ label: '', x: '', y: '', width: '', height: '' });
    } else {
        toast({
            variant: "destructive",
            title: "Campos incompletos",
            description: "Por favor, rellena todos los campos para añadir un rectángulo.",
        });
    }
  };

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setManualRect(prev => ({ ...prev, [name]: value }));
  };

  const handleRectUpdate = (id: number, field: keyof Omit<Rectangle, 'id'>, value: string | number) => {
    setRectangles(prev => 
        prev.map(rect => 
            rect.id === id 
                ? { ...rect, [field]: typeof value === 'string' && field !== 'label' ? parseInt(value) || 0 : value } 
                : rect
        )
    );
  };
  
  const handleRectDelete = (id: number) => {
    setRectangles(prev => prev.filter(rect => rect.id !== id));
  };
  
  const saveToDatabase = async () => {
    if (groupedResults.length === 0 || !pdfFile) {
      toast({
        variant: "destructive",
        title: "No hay datos para guardar",
        description: "Por favor, extrae los datos primero.",
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Check for duplicates using `code`
      const codesToCheck = groupedResults.map(r => r['CODIGO DE BARRA']).filter(c => c !== undefined && c !== null);
      const deliveryDate = groupedResults[0]['FECHA ENTREGA'] as string;
      const company = groupedResults[0]['EMPRESA'] as string;

      if (codesToCheck.length > 0) {
        const { data: existing, error: checkError } = await supabase
          .from('etiquetas_i')
          .select('code')
          .eq('organization', company)
          .eq('deli_date', deliveryDate)
          .in('code', codesToCheck as (string | number)[]);

        if (checkError) {
          throw new Error(`Error al verificar duplicados: ${checkError.message}`);
        }

        if (existing && existing.length > 0) {
          toast({
            variant: "destructive",
            title: "Etiquetas duplicadas",
            description: `Las etiquetas con los códigos de barra ${existing.map(e => e.code).join(', ')} ya existen para esta fecha y empresa.`,
          });
          setIsLoading(false);
          return;
        }
      }
      
      // 2. If no duplicates, proceed to insert
      const now = new Date();
      const imp_date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const hour = now.toLocaleTimeString('en-GB'); // HH:MM:SS

      const payload = groupedResults.map((row) => ({
        folio: row["LISTADO"],
        organization: row["EMPRESA"],
        deli_date: row["FECHA ENTREGA"],
        deli_hour: row["HORA ENTREGA"],
        quantity: Number(row["CANTIDAD"]) || null,
        client: row["CLIENTE INFO"],
        client_name: row["CLIENTE"],
        code: Number(row["CODIGO DE BARRA"]) || null,
        sales_num: Number(row["NUM DE VENTA"]) || null,
        product: row["PRODUCTO"],
        sku: row["SKU"] || null,
        cp: Number(row["CP"]) || null,
        state: row["ESTADO"],
        city: row["CIUDAD"],
        imp_date: imp_date,
        hour: hour,
        sou_file: pdfFile.name,
        personal_inc: printerName,
      }));

      const { error: insertError } = await supabase
        .from("etiquetas_i")
        .insert(payload);

      if (insertError) {
        throw insertError;
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
                {pdfDoc && pageNum > 1 ? "La definición de áreas solo está habilitada en la primera página." : "Dibuja rectángulos o introduce coordenadas para definir áreas de extracción."}
            </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Cargar Archivo PDF</CardTitle>
              </CardHeader>
              <CardContent>
                {pdfFile && pdfThumbnail ? (
                    <div className="flex items-center gap-4 p-4 border rounded-lg">
                        <img src={pdfThumbnail} alt="PDF preview" className="w-16 h-20 object-cover rounded-md bg-gray-100" />
                        <div className="flex-grow">
                            <p className="font-medium text-sm truncate">{pdfFile.name}</p>
                            <p className="text-xs text-muted-foreground">{numPages} página(s)</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={resetPdfState} className="shrink-0">
                            <X className="h-4 w-4" />
                            <span className="sr-only">Quitar archivo</span>
                        </Button>
                    </div>
                ) : (
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
                            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent transition-colors"
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-semibold text-primary">Haz clic para subir</span> o arrastra
                                </p>
                                <p className="text-xs text-muted-foreground">Solo archivos PDF</p>
                            </div>
                        </label>
                    </div>
                )}
                {error && <p className="mt-4 text-sm text-destructive font-medium">{error}</p>}
                {qrCodeValue && <p className="mt-4 text-sm text-green-600">Código QR encontrado: {qrCodeValue}</p>}
                 {isLoading && <p className="mt-4 text-sm text-primary animate-pulse">Procesando...</p>}
              </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Configuración de Etiqueta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div>
                        <Label htmlFor="company-select">Seleccionar Empresa</Label>
                        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                            <SelectTrigger id="company-select" className="w-full">
                                <SelectValue placeholder="Selecciona una empresa" />
                            </SelectTrigger>
                            <SelectContent>
                                {COMPANIES.map(company => (
                                    <SelectItem key={company} value={company}>{company}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div>
                        <Label htmlFor="printer-name">Imprimió</Label>
                        <Input 
                            id="printer-name" 
                            placeholder="Nombre de la persona" 
                            value={printerName} 
                            onChange={(e) => setPrinterName(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
        
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-b-0">
                <Card>
                   <CardHeader>
                        <div className="flex w-full flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                             <AccordionTrigger className="w-full justify-between" disabled={!pdfDoc}>
                                <CardTitle className="text-xl text-left">Resultados de la Extracción</CardTitle>
                             </AccordionTrigger>
                             <div className="flex gap-2 w-full sm:w-auto">
                                <Button onClick={() => handleExtractData(pdfDoc)} disabled={isLoading || !pdfDoc || rectangles.length === 0 || !selectedCompany} className="flex-1 sm:flex-none">
                                    Extraer Datos
                                </Button>
                                <Button onClick={handleDownloadModifiedPdf} disabled={isLoading || !pdfDoc || !selectedCompany || groupedResults.length === 0} className="flex-1 sm:flex-none">
                                    <Download className="mr-2 h-4 w-4" />
                                    Descargar PDF Modificado
                                </Button>
                                <Button onClick={saveToDatabase} disabled={isLoading || groupedResults.length === 0} className="flex-1 sm:flex-none">
                                    <Database className="mr-2 h-4 w-4" />
                                    Guardar en Base de Datos
                                </Button>
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
                                                {allHeaders.filter(h => h && h !== 'FECHA ENTREGA').map(header => (
                                                    <TableHead key={header} className="font-semibold">{header}</TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groupedResults.map((row, index) => (
                                                <TableRow key={index}>
                                                    {allHeaders.filter(h => h && h !== 'FECHA ENTREGA').map(header => (
                                                        <TableCell key={header}>
                                                            { (row[header] as string) || ''}
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
                        <div className="flex items-center gap-1.5 text-sm font-medium tabular-nums">
                            <span>Página</span>
                            <Input
                                type="number"
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                onKeyDown={handlePageInputChange}
                                onBlur={() => setPageInput(String(pageNum))}
                                className="h-8 w-16 text-center"
                                disabled={pageRendering}
                            />
                            <span>de {numPages}</span>
                        </div>
                        <Button onClick={onNextPage} disabled={pageNum >= numPages || pageRendering} variant="outline" size="icon">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                </CardHeader>
                <CardContent>
                <div 
                    className={cn(
                        "h-[70vh] w-full rounded-md border overflow-auto flex justify-center items-start relative bg-gray-50 dark:bg-gray-900/50",
                            pageNum === 1 ? "cursor-crosshair" : "cursor-default"
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div
                    ref={drawingAreaRef}
                    className="absolute top-0 left-0"
                    style={{ touchAction: 'none' }}
                    >
                    <canvas ref={canvasRef}></canvas>
                    {pageNum === 1 && rectangles.map((rect) => (
                        <div
                            key={rect.id}
                            className="absolute border-2 border-destructive/70 drawn-rectangle pointer-events-none"
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
          
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-b-0">
                <Card>
                    <AccordionTrigger className="p-6 w-full">
                        <CardTitle>Configuración Manual de Áreas</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="px-6 pb-6 flex flex-col lg:flex-row gap-8">
                            <Card className="flex-1">
                                <CardHeader>
                                    <CardTitle>Entrada Manual de Coordenadas</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="label">Etiqueta</Label>
                                        <Input id="label" name="label" value={manualRect.label} onChange={handleManualInputChange} placeholder="Ej: NÚM DE VENTA" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="x">X</Label>
                                            <Input id="x" name="x" type="number" value={manualRect.x} onChange={handleManualInputChange} placeholder="54" />
                                        </div>
                                        <div>
                                            <Label htmlFor="y">Y</Label>
                                            <Input id="y" name="y" type="number" value={manualRect.y} onChange={handleManualInputChange} placeholder="57" />
                                        </div>
                                        <div>
                                            <Label htmlFor="width">W (ancho)</Label>
                                            <Input id="width" name="width" type="number" value={manualRect.width} onChange={handleManualInputChange} placeholder="159" />
                                        </div>
                                        <div>
                                            <Label htmlFor="height">H (alto)</Label>
                                            <Input id="height" name="height" type="number" value={manualRect.height} onChange={handleManualInputChange} placeholder="27" />
                                        </div>
                                    </div>
                                    <Button onClick={handleManualAdd} className="w-full">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Añadir Rectángulo
                                    </Button>
                                </CardContent>
                            </Card>
                            {rectangles.length > 0 && (
                                <Card className="flex-1">
                                    <CardHeader>
                                        <CardTitle>Áreas Definidas</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4 max-h-96 overflow-y-auto">
                                        {rectangles.map((rect) => (
                                            <div key={rect.id} className="p-3 border rounded-lg space-y-3 bg-card">
                                                <div className="flex justify-between items-center">
                                                    <Input
                                                        value={rect.label}
                                                        onChange={(e) => handleRectUpdate(rect.id, 'label', e.target.value)}
                                                        className="text-base font-semibold border-0 shadow-none focus-visible:ring-0 p-0 h-auto"
                                                    />
                                                    <Button onClick={() => handleRectDelete(rect.id)} variant="ghost" size="icon" className="h-8 w-8">
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`x-${rect.id}`} className="text-xs">X</Label>
                                                        <Input id={`x-${rect.id}`} type="number" value={rect.x} onChange={(e) => handleRectUpdate(rect.id, 'x', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`y-${rect.id}`} className="text-xs">Y</Label>
                                                        <Input id={`y-${rect.id}`} type="number" value={rect.y} onChange={(e) => handleRectUpdate(rect.id, 'y', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`w-${rect.id}`} className="text-xs">Ancho (W)</Label>
                                                        <Input id={`w-${rect.id}`} type="number" value={rect.width} onChange={(e) => handleRectUpdate(rect.id, 'width', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`h-${rect.id}`} className="text-xs">Alto (H)</Label>
                                                        <Input id={`h-${rect.id}`} type="number" value={rect.height} onChange={(e) => handleRectUpdate(rect.id, 'height', e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </AccordionContent>
                </Card>
            </AccordionItem>
        </Accordion>
        
      </div>
    </main>
  );
}

    




