import { Suspense } from "react";
import { MobileFamilyTabs } from "@/components/mobile/MobileFamilyTabs";

export default function MobileFamilyPage() {
  // MobileFamilyTabs reads the initial tab from `?tab=` via useSearchParams,
  // which Next.js requires a Suspense boundary around (otherwise the whole
  // route opts out of static optimization at build time).
  return (
    <Suspense fallback={null}>
      <MobileFamilyTabs />
    </Suspense>
  );
}
