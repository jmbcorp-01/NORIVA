import { mediaUrl } from "@/lib/media";

/** 3:4 표지. 표지가 아직 없으면 제목만 얹은 먹색 자리를 보여줘요. */
export function Cover({ src, title, className = "", eager = false }: { src: string; title: string; className?: string; eager?: boolean }) {
  return (
    <div className={`relative aspect-[3/4] overflow-hidden rounded-[5px] bg-[#2f3a40] ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(src)} alt="" className="absolute inset-0 h-full w-full object-cover" loading={eager ? "eager" : "lazy"} />
      ) : (
        <span className="absolute inset-0 grid place-items-center px-3 text-center font-serif text-[15px] font-semibold text-[#e9e2d3]">{title}</span>
      )}
    </div>
  );
}
