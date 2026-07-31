const PDF_JS_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.mjs";
const PDF_WORKER_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.mjs";

let pdfJsPromise;

const getPdfJs = () => {
  if (!pdfJsPromise) {
    pdfJsPromise = import(/* @vite-ignore */ PDF_JS_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      return pdfjs;
    });
  }

  return pdfJsPromise;
};

const dataUrlToBytes = (dataUrl) => {
  const base64 = dataUrl.split(",")[1];
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

export const loadPdf = async (dataUrl) => {
  const pdfjs = await getPdfJs();
  return pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
};
