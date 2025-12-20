"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { extractPurchaseOrder, PurchaseOrder } from "@/ai/flows/extract-purchase-order-flow";
import { Html5Qrcode } from "html5-qrcode";

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDataUri, setPdfDataUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<PurchaseOrder | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setError(null);
      setExtractedData(null);
      
      // Reset QR code value for new file
      setQrCodeValue(null);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setPdfDataUri(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Scan for QR code
      try {
        // The library needs a file object to scan, not a data URI
        const html5QrCode = new Html5Qrcode("qr-reader", true);
        const decodedText = await html5QrCode.scanFile(file, false);
        console.log("QR Code Found:", decodedText);
        setQrCodeValue(decodedText);
      } catch (err) {
        setQrCodeValue(null);
        console.log("QR Code scan failed or no QR code found.", err);
      }

    } else {
      setPdfFile(null);
      setPdfDataUri(null);
      setQrCodeValue(null);
      setError("Por favor, sube un archivo PDF válido.");
    }
  };

  const handleExtract = async () => {
    if (!pdfDataUri) {
      setError("Por favor, primero sube un archivo PDF.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setExtractedData(null);

    try {
        const result = await extractPurchaseOrder({ pdfDataUri: pdfDataUri });
        
        // This is the correct place to merge the QR code data
        if (qrCodeValue && result.lineItems.length > 0) {
            const updatedLineItems = result.lineItems.map(item => ({
                ...item,
                codigo: item.codigo || qrCodeValue,
            }));
            const updatedResult = { ...result, lineItems: updatedLineItems };
            setExtractedData(updatedResult);
        } else {
            setExtractedData(result);
        }

    } catch (err) {
        console.error("Error durante la extracción:", err);
        setError("Ocurrió un error al extraer la información. Por favor, inténtalo de nuevo.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
      <div id="qr-reader" style={{ display: 'none' }}></div>
      <div className="container mx-auto max-w-7xl space-y-8">
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-bold tracking-tight text-primary">
                Extractor Inteligente de Facturas
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
            </CardContent>
            <CardFooter>
                 <Button onClick={handleExtract} disabled={!pdfFile || isLoading}>
                    {isLoading ? "Extrayendo..." : "Extraer Información"}
                </Button>
            </CardFooter>
        </Card>

        {isLoading && (
            <Card>
                <CardContent className="p-6 flex items-center justify-center">
                    <p>Analizando documento... por favor espera.</p>
                </CardContent>
            </Card>
        )}

        {extractedData && (
          <Card>
            <CardHeader>
              <CardTitle>Información Extraída</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Num de Venta</TableHead>
                            <TableHead>Fecha de Entrega</TableHead>
                            <TableHead>CP</TableHead>
                            <TableHead>Ciudad</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {extractedData.lineItems.map((item, index) => (
                            <TableRow key={index}>
                            <TableCell>{extractedData.cliente}</TableCell>
                            <TableCell>{extractedData.fecha}</TableCell>
                            <TableCell>{extractedData.numVenta}</TableCell>
                            <TableCell>{extractedData.fechaEntrega}</TableCell>
                            <TableCell>{extractedData.cp}</TableCell>
                            <TableCell>{extractedData.ciudad}</TableCell>
                            <TableCell>{extractedData.estado}</TableCell>
                            <TableCell>{item.codigo}</TableCell>
                            <TableCell>{item.sku}</TableCell>
                            <TableCell>{item.producto}</TableCell>
                            <TableCell className="text-right">{item.cantidad}</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
          </Card>
        )}
        
        {pdfDataUri && !extractedData && !isLoading && (
          <Card>
            <CardHeader>
              <CardTitle>Vista Previa del PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[80vh] w-full rounded-md border">
                <object data={pdfDataUri} type="application/pdf" width="100%" height="100%">
                    <p>Tu navegador no puede mostrar el PDF. Puedes descargarlo para verlo.</p>
                </object>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
