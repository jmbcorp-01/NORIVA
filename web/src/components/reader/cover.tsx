import { mediaUrl } from "@/lib/media";

/**
 * 3:4 표지. 표지가 아직 없으면 제목만 얹은 먹색 자리를 보여줘요.
 * titled: 표지 아래쪽에 작품 제목을 얹어요 (카드 줄에서 작품끼리 구분되게). 작은 썸네일에서는 끄세요.
 */
export function Cover({
  src,
  title,
  className = "",
  eager = false,
  titled = false,
}: {
  src: string;
  title: string;
  className?: string;
  eager?: boolean;
  titled?: boolean;
}) {
  return (
    <div className={`@container relative aspect-[3/4] overflow-hidden rounded-[5px] bg-[#2f3a40] ${className}`}>
      {src ? (
        <>
          {/* 가로로 넓은 자리(홈 첫 화면)에서 세로 표지를 자르면 얼굴이 잘려요. 위쪽(얼굴)을 기준으로 잘라요. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(src)} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_18%]" loading={eager ? "eager" : "lazy"} />
          {titled ? (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(18,22,26,0)_0%,rgba(18,22,26,.78)_70%)] px-[7%] pb-[7%] pt-[28%]">
              <span className="line-clamp-2 block font-serif text-[clamp(11px,11cqw,22px)] font-bold leading-[1.15] text-[#f4efe4] [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">
                {title}
              </span>
            </span>
          ) : null}
        </>
      ) : (
        <span className="absolute inset-0 grid place-items-center px-3 text-center font-serif text-[15px] font-semibold text-[#e9e2d3]">{title}</span>
      )}
    </div>
  );
}
