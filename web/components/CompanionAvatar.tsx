import type { CompanionStyle } from "@/lib/preferences";

// Original vector characters share the same palette and interaction targets.
export function CompanionAvatar({ kind }: { kind: CompanionStyle }) {
  return <svg className={`companion-art companion-${kind}`} viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
    <ellipse className="companion-shadow" cx="60" cy="108" rx="29" ry="4" />
    {kind === "falcon" ? <g className="companion-body">
      <path className="companion-feet" d="M46 99v8m-5 0h11m21-8v8m-5 0h11" strokeWidth="4" strokeLinecap="round" />
      <path className="feather-dark" d="M49 88l3 17 8-5 8 5 3-17" />
      <path className="feather-mid" d="M31 57c-8 12-7 36 8 43 13 7 35 7 44-2 11-11 11-29 3-44Z" />
      <path className="feather-light" d="M42 58c-9 9-9 30 0 37 9 9 29 9 37-1 8-10 5-29-3-36Z" />
      <path className="feather-dark companion-wing" d="M31 59c-13 5-15 25-10 33 9-2 16-11 18-24Z" />
      <path className="feather-dark companion-wing-other" d="M86 59c13 5 15 25 10 33-9-2-16-11-18-24Z" />
      <g className="companion-head">
        <path className="feather-dark" d="M29 55c-4-19 3-37 21-39l12-5 10 6c18 1 24 21 18 40-11 21-49 24-61-2Z" />
        <path className="feather-light" d="M34 38c6-12 19-11 26-2 9-10 23-9 28 4 8 23-4 35-27 35-24 0-35-14-27-37Z" />
        <path className="feather-mid" d="M33 51l13 7-2 16-10-9Zm54 0-13 7 2 16 10-9Z" />
        <g className="companion-eyes">
          <ellipse className="eye-white" cx="45" cy="45" rx="11" ry="13" /><ellipse className="eye-white" cx="75" cy="45" rx="11" ry="13" />
          <g className="companion-pupils"><ellipse className="eye-ink" cx="48" cy="47" rx="5" ry="7" /><ellipse className="eye-ink" cx="72" cy="47" rx="5" ry="7" /><circle fill="white" cx="49.5" cy="44.5" r="1.8" /><circle fill="white" cx="73.5" cy="44.5" r="1.8" /></g>
        </g>
        <path className="companion-beak" d="M53 57c2-5 12-5 14 0l-7 12Z" />
        <path className="feather-mark" d="m48 81 3 3m9-1 1 4m9-6-2 3" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </g> : kind === "fox" ? <g className="companion-body">
      <path className="fox-fur companion-tail" d="M75 97c36 8 44-16 28-32 0 12-13 9-20 15-7 5-8 10-8 17Z" />
      <path className="feather-light companion-tail-tip" d="M101 80c9-1 10-8 2-15 0 8-6 11-9 12Z" />
      <path className="fox-fur" d="M41 69c-6 11-8 26-2 34 9 7 32 7 40-1 4-11-1-23-8-33Z" />
      <path className="feather-light" d="M50 75c-5 7-8 17-4 22 5 6 15 5 19-1 3-8-3-16-7-21Z" />
      <path className="fox-dark" d="M38 98c-3 8 3 9 13 7l-1-7m14 0-1 7c11 2 17 0 12-8" />
      <g className="companion-head">
        <g className="companion-ear"><path className="fox-fur" d="M28 43C19 28 21 9 26 7c12 5 22 20 22 28Z" /><path className="fox-inner" d="M30 33c-4-8-5-17-3-20 6 4 12 13 13 20Z" /></g>
        <g className="companion-ear-other"><path className="fox-fur" d="M71 33C75 18 90 8 96 11c3 12-2 28-10 35Z" /><path className="fox-inner" d="M79 33c3-8 9-14 13-16 0 7-3 13-7 18Z" /></g>
        <path className="fox-fur" d="M23 43c7-16 23-17 36-15 17-3 31 6 33 19l6 9-12 14c-17 14-40 12-56-2l-13-13Z" />
        <path className="feather-light" d="M23 53c11-3 23 2 35 13 12-10 23-15 35-11-8 22-25 28-35 27-15-1-26-13-35-29Z" />
        <g className="companion-eyes">
          <ellipse className="eye-white" cx="41" cy="47" rx="9" ry="10" /><ellipse className="eye-white" cx="75" cy="47" rx="9" ry="10" />
          <g className="companion-pupils"><ellipse className="eye-ink" cx="43" cy="48" rx="4" ry="6" /><ellipse className="eye-ink" cx="73" cy="48" rx="4" ry="6" /><circle fill="white" cx="44" cy="46" r="1.4" /><circle fill="white" cx="74" cy="46" r="1.4" /></g>
        </g>
        <path className="eye-ink" d="M52 65q6-4 12 0-1 8-6 8t-6-8Z" />
        <path className="feather-mark" d="M58 72v4m-5-1q5 5 10 0" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </g> : <g className="companion-body">
      <g className="pearl-orbit"><ellipse className="pearl-ring" cx="60" cy="52" rx="43" ry="16" transform="rotate(-28 60 52)" /><circle className="pearl-satellite" cx="94" cy="28" r="4" /></g>
      <g className="pearl-core"><circle className="pearl-rim" cx="60" cy="49" r="26" /><circle className="pearl-fill" cx="58" cy="46" r="23" /><path className="pearl-shine" d="M43 44c1-8 5-12 13-13" strokeWidth="5" strokeLinecap="round" /><circle className="pearl-glint" cx="69" cy="61" r="2" /></g>
      <path className="shell-back" d="M25 81c-2-7 5-14 12-10 1-11 12-13 18-5 4-11 15-10 19-1 10-7 20 0 17 10 12 0 13 11 6 17-16 20-51 21-69 3Z" />
      <path className="shell-front" d="M25 81c13-3 22 1 35 11 10-11 23-16 38-14-6 22-22 29-38 29-17 0-28-10-35-26Z" />
      <path className="shell-ribs" d="m38 86 17 16m-3-16 6 16m10-16-6 16m19-18-16 18" strokeWidth="1.8" strokeLinecap="round" />
      <path className="pearl-spark" d="M25 29v10m-5-5h10m61 25v8m-4-4h8" strokeWidth="2" strokeLinecap="round" />
    </g>}
  </svg>;
}
