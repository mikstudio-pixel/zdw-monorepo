const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_URL_LENGTH = 16 * 1024 * 1024;

export function decodePng(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_PNG_URL_LENGTH ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
    throw new Error('Snímek nemá platný formát PNG nebo je příliš velký.');
  }
  const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (!buffer.subarray(0, signature.length).equals(signature)) throw new Error('Snímek není platný PNG.');
  return buffer;
}
