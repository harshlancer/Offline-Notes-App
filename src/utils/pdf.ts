let RNHTMLtoPDF: any = null;

type Options = {
  html: string;
  fileName?: string;
};

const loadPDF = () => {
  if (RNHTMLtoPDF !== null) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNHTMLtoPDF = require('react-native-html-to-pdf').default;
  } catch (e) {
    console.warn('react-native-html-to-pdf not available; PDF export disabled.');
    RNHTMLtoPDF = false;
  }
};

export const createPdfFromHtml = async (opts: Options): Promise<string | null> => {
  try {
    loadPDF();
    if (!RNHTMLtoPDF) {
      console.warn('PDF export not available');
      return null;
    }
    const file = await RNHTMLtoPDF.convert({
      html: opts.html,
      fileName: opts.fileName || 'note',
      base64: false,
    });

    return file.filePath || null;
  } catch (e) {
    console.warn('createPdfFromHtml failed', e);
    return null;
  }
};

export default createPdfFromHtml;
