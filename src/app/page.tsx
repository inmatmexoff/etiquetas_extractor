"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Home() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
    }
  };

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

        {pdfUrl && (
          <Card>
            <CardHeader>
              <CardTitle>Vista Previa del PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[calc(100vh-20rem)] w-full">
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  width="100%"
                  height="100%"
                  className="rounded-md border"
                >
                  <p>
                    Tu navegador no soporta la previsualización de PDFs. 
                    Puedes <a href={pdfUrl}>descargarlo aquí</a>.
                  </p>
                </object>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
