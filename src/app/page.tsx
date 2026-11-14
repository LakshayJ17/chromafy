import { ActionBand } from "@/components/landing/action-band";
import { Hero } from "@/components/landing/hero";
import { SampleWall } from "@/components/landing/sample-wall";
import { StagesBar } from "@/components/landing/stages-bar";
import { WorldIndex } from "@/components/landing/world-index";
import { SiteFooter } from "@/components/layout/site-footer";

export default function HomePage() {
  return (
    <div id="top">
      <Hero />
      <main>
        <WorldIndex />
        <StagesBar />
        <SampleWall />
        <ActionBand />
      </main>
      <SiteFooter />
    </div>
  );
}
