import { useRef, useState } from 'react';
import type { LocalAttachment, LocalCatalogueItem } from '../db/local';
import { uuid } from '../lib/ids';

type Props = {
  catalogue: LocalCatalogueItem[];
  onSavePhoto: (attachment: LocalAttachment) => void;
  onAddSuggested: (item: LocalCatalogueItem, setQty: number) => void;
};

/** Lightweight “OCR”: match design codes present in filename / optional text note */
function suggestFromText(text: string, catalogue: LocalCatalogueItem[]) {
  const upper = text.toUpperCase();
  return catalogue
    .filter((c) => upper.includes(c.designCode.toUpperCase()))
    .slice(0, 5)
    .map((c) => ({ item: c, setQty: 1 }));
}

export function PhotoAttach({ catalogue, onSavePhoto, onAddSuggested }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>('');
  const [note, setNote] = useState('');
  const [suggestions, setSuggestions] = useState<
    Array<{ item: LocalCatalogueItem; setQty: number }>
  >([]);
  const [savedMsg, setSavedMsg] = useState('');

  async function handleFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setPreview(dataUrl);
    const attachment: LocalAttachment = {
      id: uuid(),
      blob: file,
      dataUrl,
      mimeType: file.type || 'image/jpeg',
      filename: file.name || `order-photo-${Date.now()}.jpg`,
      ocrSuggestions: [],
    };
    onSavePhoto(attachment);
    setSavedMsg('Photo saved on phone');
    const guessed = suggestFromText(`${file.name} ${note}`, catalogue);
    setSuggestions(guessed);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.accept = 'image/*';
              fileRef.current.setAttribute('capture', 'environment');
              fileRef.current.click();
            }
          }}
        >
          Photograph order
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.removeAttribute('capture');
              fileRef.current.accept = 'image/*';
              fileRef.current.click();
            }
          }}
        >
          Attach screenshot
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      {savedMsg ? <div className="banner info">{savedMsg}</div> : null}
      {preview ? (
        <img
          src={preview}
          alt="Order reference"
          style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 12 }}
        />
      ) : null}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="ocr-note">Optional note / codes for suggestions</label>
        <input
          id="ocr-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. MNQ-401 x2 MNQ-402"
        />
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setSuggestions(suggestFromText(note, catalogue))}
      >
        Review suggestions
      </button>
      {suggestions.length > 0 ? (
        <div className="list" style={{ marginTop: 10 }}>
          <p className="muted">Suggested matches — review before add</p>
          {suggestions.map(({ item, setQty }) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>
                  {item.designCode} · {item.colour}
                </strong>
                <span className="muted">
                  {item.packSize}pc pack · ₹{item.wholesalePricePerSet}/set
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onAddSuggested(item, setQty)}
              >
                Add {setQty} set
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
