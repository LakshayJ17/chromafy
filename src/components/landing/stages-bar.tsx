import { Reveal } from "@/components/ui/reveal";
import { MOODS } from "@/lib/config/moods";

/**
 * How it works, drawn as the product's own progress bar. Segment widths follow
 * how long each stage really takes: choosing is quick; the model's work is most of it.
 */
const STAGES = [
  {
    duration: "A few seconds",
    clause: "First, choose a photo of your own, or borrow one of ours.",
    grow: 14,
    background: "var(--paper-3)",
    ink: "var(--ink)",
  },
  {
    duration: "One tap",
    clause: "Then pick a world, or let Surprise Me choose for you.",
    grow: 14,
    background: MOODS.golden.field.background,
    ink: MOODS.golden.field.ink,
  },
  {
    duration: "Up to two minutes",
    clause: "Finally, the model repaints the light. Compare, download or try another world.",
    grow: 72,
    background: MOODS.daydream.field.background,
    ink: MOODS.daydream.field.ink,
  },
];

export function StagesBar() {
  return (
    <section id="how" aria-labelledby="how-title" className="bg-ink py-24 text-paper lg:py-36">
      <Reveal className="page-x">
        <h2 id="how-title" className="max-w-[12ch] text-[11vw] leading-[1.02] lg:text-display">
          Three steps to new light
        </h2>

        <ol data-ui className="mt-16 flex flex-col gap-[6px] lg:h-[22vh] lg:min-h-[180px] lg:flex-row">
          {STAGES.map((stage) => (
            <li
              key={stage.duration}
              className="flex min-h-[72px] flex-col p-5 lg:min-h-0 lg:basis-0"
              style={{ flexGrow: stage.grow, backgroundColor: stage.background, color: stage.ink }}
            >
              <span className="text-lead">{stage.duration}</span>
              <span className="mt-2 text-body lg:hidden">{stage.clause}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 hidden gap-[6px] lg:flex" aria-hidden="true">
          {STAGES.map((stage) => (
            <p key={stage.duration} className="basis-0 pr-6 text-body" style={{ flexGrow: stage.grow }}>
              <span className="block max-w-[22ch]">{stage.clause}</span>
            </p>
          ))}
        </div>
        <p className="mt-14 max-w-[40rem] text-body text-paper/85">
          Generation time depends on the image service and is not guaranteed. Results are generative
          interpretations: the subject and composition are kept wherever possible, but details can change.
        </p>
      </Reveal>
    </section>
  );
}
