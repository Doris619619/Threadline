/** @fileoverview 沿用小屋像素配色的计划装饰图标；按名称提供视觉提示，不新增业务字段。 */
import {
  BookOpen,
  Flag,
  GraduationCap,
  Headphones,
  Package,
  Plane,
  FlaskConical,
  Tent,
  FileText,
  Code,
  Dumbbell,
} from 'lucide-react';

type Kind = 'stage' | 'project' | 'daily';

/** 根据现有名称选择装饰主题；无匹配名称使用通用图标，不影响归属或命令。 */
export function PlanObjectIcon({ name, kind }: { name: string; kind: Kind }) {
  const glyph =
    kind === 'stage'
      ? /假期|国庆|寒假/.test(name)
        ? 'flag'
        : /访学|德国|旅行/.test(name)
          ? 'plane'
          : 'books'
      : kind === 'daily'
        ? /算法|编程|代码/.test(name)
          ? 'code'
          : /运动|健身|锻炼/.test(name)
            ? 'exercise'
            : 'paper'
        : /课|学习/.test(name)
          ? 'cap'
          : /研|论文/.test(name)
            ? 'science'
            : /音乐|music/i.test(name)
              ? 'music'
              : /活动|生活|旅行/.test(name)
                ? 'tent'
                : 'box';
  const Standard = {
    flag: Flag,
    plane: Plane,
    books: BookOpen,
    code: Code,
    exercise: Dumbbell,
    paper: FileText,
    cap: GraduationCap,
    science: FlaskConical,
    music: Headphones,
    tent: Tent,
    box: Package,
  }[glyph];
  return (
    <span className="cottage-nav-icon plan-object-icon">
      <span className="cottage-standard-icon">
        <Standard size={30} aria-hidden="true" />
      </span>
      <svg
        className="cottage-sprite"
        width="32"
        height="32"
        viewBox="0 0 32 32"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <g stroke="#735d65" strokeWidth="1" strokeLinejoin="miter">
          {glyph === 'flag' && (
            <>
              <path fill="#c5ad8a" d="M4 4h2v26H4z" />
              <path fill="#eb735d" d="M6 5h22v18H6z" />
              <path fill="#ffe497" stroke="none" d="M12 8h3v3h3v2h-3v3h-3v-3H9v-2h3z" />
            </>
          )}
          {glyph === 'plane' && (
            <>
              <path fill="#a8d4e9" d="M3 11h12V3h4v8h10v4H19v10h5v4H12v-4h3V15H3z" />
              <path fill="#fff6e0" stroke="none" d="M16 6h2v19h-2zM5 12h10v2H5z" />
            </>
          )}
          {glyph === 'books' && (
            <>
              <path fill="#e8a6b2" d="M5 20h21v8H5z" />
              <path fill="#b5a0df" d="M3 12h22v8H3z" />
              <path fill="#a6c99b" d="M6 4h22v8H6z" />
              <path stroke="#fff7e4" strokeWidth="3" d="M10 8h14M7 16h14M9 24h13" />
            </>
          )}
          {glyph === 'cap' && (
            <>
              <path fill="#b7a4df" d="M2 10l14-6 14 6-14 7zM8 15l8 4 8-4v7l-8 4-8-4z" />
              <path stroke="#efcd8a" strokeWidth="2" d="M28 11v10M27 21h3v5h-3z" />
            </>
          )}
          {glyph === 'science' && (
            <>
              <path fill="#b8c7d6" d="M12 3h8v4h-2v10l8 11H6l8-11V7h-2z" />
              <path fill="#a9d9d4" d="M11 20h10l4 6H7z" />
              <path stroke="#fff6e0" strokeWidth="2" d="M15 10v6M12 22h4" />
            </>
          )}
          {glyph === 'music' && (
            <>
              <path
                fill="none"
                stroke="#a6c79a"
                strokeWidth="3"
                d="M5 21V13h2V8h4V5h10v3h4v5h2v8"
              />
              <path fill="#f0ddbd" d="M3 17h6v11H3zM23 17h6v11h-6z" />
              <path fill="#acb9d7" d="M7 18h4v9H7zM21 18h4v9h-4z" />
            </>
          )}
          {glyph === 'tent' && (
            <>
              <path fill="#e49b63" d="M3 27L16 5l13 22z" />
              <path fill="#fff2b4" d="M9 27l7-14 7 14z" />
              <path fill="#bb778c" d="M14 27l2-10 2 10z" />
              <path stroke="#d1c7ac" strokeWidth="2" d="M13 3l5 6M19 3l-5 7" />
            </>
          )}
          {glyph === 'box' && (
            <>
              <path fill="#dfbd98" d="M4 10l12-6 12 6v16l-12 5-12-5z" />
              <path fill="#f1d5b2" d="M4 10l12 5 12-5-12-6z" />
              <path fill="none" d="M16 15v16M10 7l12 5v7" />
            </>
          )}
          {glyph === 'paper' && (
            <>
              <path fill="#d5bce9" d="M7 3h13l6 6v21H7z" />
              <path fill="#fff2fa" d="M20 3v7h6" />
              <path stroke="#85739d" strokeWidth="2" d="M11 15h11M11 20h11M11 25h7" />
            </>
          )}
          {glyph === 'code' && (
            <>
              <path
                fill="none"
                stroke="#b6b6ee"
                strokeWidth="3"
                d="M10 8l-7 8 7 8M22 8l7 8-7 8M19 4l-6 24"
              />
            </>
          )}
          {glyph === 'exercise' && (
            <>
              <path
                fill="#f0b6d1"
                d="M3 10h4v14H3zM7 7h4v20H7zM21 7h4v20h-4zM25 10h4v14h-4z"
              />
              <path fill="#ddd3e7" d="M11 14h10v6H11z" />
            </>
          )}
        </g>
      </svg>
    </span>
  );
}
