"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Html5Qrcode } from "html5-qrcode";

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDataUri, setPdfDataUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setError(null);
      setQrCodeValue(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        setPdfDataUri(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // We need to create a new file object for the scanner as it can be consumed.
      const fileForScanner = new File([file], file.name, {type: file.type});
      scanQrCode(fileForScanner);
    } else {
      setPdfFile(null);
      setPdfDataUri(null);
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
  }


  const handleExtract = async () => {
    if (!pdfDataUri) {
      setError("Por favor, primero sube un archivo PDF.");
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
        // AI Extraction logic removed. This will be replaced with coordinate-based extraction.
        console.log("Extraction logic to be implemented.");

    } catch (err: any) {
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
        
        {pdfDataUri && (
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
