import { mediaUrl } from "@/lib/media";

/** 3:4 표지. 표지가 아직 없으면 제목만 얹은 먹색 자리를 보여줘요. */
export function Cover({ src, title, className = "", eager = false }: { src: string; title: string; className?: string; eager?: boolean }) {
  return (
    <div className={`relative aspect-[3/4] overflow-hidden rounded-[5px] bg-[#2f3a40] ${className}`}>
      {src ? (
        // 가로로 넓은 자리(홈 첫 화면)에서 세로 표지를 자르면 얼굴이 잘려요. 위쪽(얼굴)을 기준으로 잘라요.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(src)} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_18%]" loading={eager ? "eager" : "lazy"} />
      ) : (
        <span className="absolute inset-0 grid place-items-center px-3 text-center font-serif text-[15px] font-semibold text-[#e9e2d3]">{title}</span>
      )}
    </div>
  );
}
