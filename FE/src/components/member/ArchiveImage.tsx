import { useEffect, useState } from 'react';
import { readArchiveFile } from '../../services/archiveFiles';

interface Props {
  id: string;
  name: string;
  version?: string;
  url?: string;
  full?: boolean;
}

export function ArchiveImage({ id, name, version, url, full = false }: Props) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setSource('');
    setLoading(true);
    setFailed(false);
    readArchiveFile(id).then(stored => {
      if (cancelled) return;
      if (stored) {
        objectUrl = URL.createObjectURL(stored.blob);
        setSource(objectUrl);
      } else if (url && /^(https?:\/\/|data:image\/)/i.test(url)) {
        setSource(url);
      }
    }).catch(() => {
      if (!cancelled && url && /^(https?:\/\/|data:image\/)/i.test(url)) setSource(url);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, url, version]);

  return source && !failed ? (
    <img className={full ? 'archive-image-full' : 'archive-image-thumbnail'} src={source} alt={name} onError={() => setFailed(true)} />
  ) : (
    <span className="archive-image-empty">
      <span aria-hidden="true">▧</span>
      <small>{loading ? 'Đang tải ảnh…' : failed ? 'Không đọc được ảnh' : 'Chưa có tệp ảnh'}</small>
    </span>
  );
}
