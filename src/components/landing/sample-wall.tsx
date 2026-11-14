import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { SAMPLES } from "@/lib/config/samples";

/** A specimen wall: the heading, eight ordinary originals, and the way to bring your own. */
export function SampleWall() {
  return (
    <section id="samples" aria-labelledby="samples-title" className="bg-paper py-2">
      <Reveal as="ul" className="grid grid-cols-2 gap-[6px] px-2 md:grid-cols-5 md:gap-2">
        <li className="flex aspect-square flex-col justify-between bg-paper-3 p-5 sm:p-6">
          <h2 id="samples-title" className="text-lead xl:text-head">
            Borrow a photo
          </h2>
          <p className="text-small text-ink-2 md:hidden xl:block">Ordinary, unedited originals. Pick one to try a world on it.</p>
        </li>
        {SAMPLES.map((sample) => (
          <li key={sample.id}>
            <Link
              href={`/create?sample=${sample.id}`}
              className="group relative block aspect-square overflow-hidden bg-paper-3"
              aria-label={`Try with the ${sample.title.toLowerCase()} photo`}
            >
              <Image
                src={sample.small}
                alt={sample.alt}
                fill
                sizes="(min-width: 768px) 20vw, 50vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              />
              <span className="scrim-bottom absolute inset-x-0 bottom-0 h-1/3" aria-hidden="true" />
              <span className="absolute inset-x-0 bottom-[18px] text-center text-small font-medium text-paper">
                {sample.title}
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/create"
            aria-label="Use your own photo"
            className="group flex aspect-square flex-col justify-between bg-accent p-5 text-on-accent transition-colors duration-200 hover:bg-accent-press sm:p-6"
          >
            <ArrowUpRight
              className="size-10 self-end transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={1.25}
              aria-hidden="true"
            />
            <span className="font-display text-lead tracking-[-0.022em] xl:text-head">
              Use yours
            </span>
          </Link>
        </li>
      </Reveal>
      <p className="page-x pb-6 pt-4 text-small text-ink-2">
        Sample photographs by {SAMPLES.map((sample) => sample.credit.author).join(", ")}, from Unsplash under
        the Unsplash Licence.
      </p>
    </section>
  );
}
