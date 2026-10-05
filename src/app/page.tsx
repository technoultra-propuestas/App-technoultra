import Image from "next/image";
import { Wordmark } from "@/components/brand/Wordmark";

export default function HomePage() {
  return (
    <main className="min-h-screen-dvh pt-safe pb-safe flex flex-col items-center justify-center gap-6 bg-ink px-4 text-center text-white">
      <div className="h-32 w-32 overflow-hidden rounded-full">
        <Image
          src="/logo-technoultra.png"
          alt="TechnoUltra"
          width={128}
          height={128}
          priority
          className="h-full w-full scale-[1.2] object-cover"
        />
      </div>
      <h1 className="m-0">
        <Wordmark size={28} />
      </h1>
      <p className="m-0 max-w-sm text-base text-line-strong">
        Tecnología que funciona, con personas que responden.
      </p>
    </main>
  );
}
