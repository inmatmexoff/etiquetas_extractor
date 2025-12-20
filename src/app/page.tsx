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
      setQrCodeValue(null);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setPdfDataUri(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Scan for QR code
      try {
        const html5QrCode = new Html5Qrcode("qr-reader");
        const decodedText = await html5QrCode.scanFile(file, false);
        setQrCodeValue(decodedText);
      } catch (err) {
        console.log("QR Code scan failed, continuing without it.", err);
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
        if (qrCodeValue && result.lineItems.length > 0) {
            result.lineItems.forEach(item => {
                item.codigo = qrCodeValue;
            });
        }
        setExtractedData(result);
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
      <div className="container mx-auto max-w-4xl space-y-8">
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
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <Label>Cliente</Label>
                            <p className="font-semibold">{extractedData.cliente}</p>
                        </div>
                         <div>
                            <Label>Fecha</Label>
                            <p className="font-semibold">{extractedData.fecha}</p>
                        </div>
                        <div>
                            <Label>Num de Venta</Label>
                            <p className="font-semibold">{extractedData.numVenta}</p>
                        </div>
                         <div>
                            <Label>Fecha de entrega a colecta</Label>
                            <p className="font-semibold">{extractedData.fechaEntrega}</p>
                        </div>
                        <div>
                            <Label>CP</Label>
                            <p className="font-semibold">{extractedData.cp}</p>
                        </div>
                        <div>
                            <Label>Ciudad</Label>
                            <p className="font-semibold">{extractedData.ciudad}</p>
                        </div>
                         <div>
                            <Label>Estado</Label>
                            <p className="font-semibold">{extractedData.estado}</p>
                        </div>
                    </div>
                    <h4 className="font-semibold mt-4">Productos</h4>
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {extractedData.lineItems.map((item, index) => (
                            <TableRow key={index}>
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
