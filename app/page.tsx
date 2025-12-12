"use client";

import { gsap } from "gsap";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Review, ReviewInsert } from "@/lib/reviews";

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={
        "h-5 w-5 transition-colors " +
        (filled ? "text-amber-400" : "text-white/25")
      }
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 17.27l-5.18 3.06 1.64-5.81L3 9.24l5.94-.51L12 3l3.06 5.73 5.94.51-5.46 5.28 1.64 5.81z" />
    </svg>
  );
}

function StarsRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} filled={i < rating} />
      ))}
    </div>
  );
}

function clampRating(n: number) {
  return Math.max(1, Math.min(5, n));
}

export default function Home() {
  const slogan = "Life Without ChatGPT Is Like The Body Without A Soul";
  const team = "Het Patel • Jenil Kukadiya • Krutarth Raychura";

  const rootRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const confettiLayerRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "teacher">(
    "all"
  );
  const [starFilter, setStarFilter] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [soundOn, setSoundOn] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  const distribution = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
      1 | 2 | 3 | 4 | 5,
      number
    >;
    for (const r of reviews) counts[clampRating(r.rating) as 1 | 2 | 3 | 4 | 5]++;
    const total = reviews.length;
    const avg =
      total === 0
        ? 0
        : Math.round(
            (reviews.reduce((sum, r) => sum + clampRating(r.rating), 0) / total) *
              10
          ) / 10;
    return { counts, total, avg };
  }, [reviews]);

  const featuredReview = useMemo(() => {
    return (
      reviews.find((r) => r.role === "teacher" && clampRating(r.rating) === 5) ??
      null
    );
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      const roleOk = roleFilter === "all" ? true : r.role === roleFilter;
      const starOk = starFilter === 0 ? true : clampRating(r.rating) === starFilter;
      return roleOk && starOk;
    });
  }, [reviews, roleFilter, starFilter]);

  function playStarClick() {
    if (!soundOn) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc.start();
      osc.stop(now + 0.09);
      osc.onended = () => {
        try {
          ctx.close();
        } catch {}
      };
    } catch {}
  }

  function burstConfetti() {
    const layer = confettiLayerRef.current;
    const btn = submitBtnRef.current;
    if (!layer || !btn) return;

    const rect = btn.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const colors = [
      "#22d3ee",
      "#a78bfa",
      "#f472b6",
      "#fbbf24",
      "#34d399",
      "#60a5fa",
    ];

    const pieces: HTMLDivElement[] = [];
    for (let i = 0; i < 28; i++) {
      const el = document.createElement("div");
      el.style.position = "fixed";
      el.style.left = `${originX}px`;
      el.style.top = `${originY}px`;
      el.style.width = `${6 + Math.random() * 6}px`;
      el.style.height = `${2 + Math.random() * 6}px`;
      el.style.borderRadius = "999px";
      el.style.background = colors[i % colors.length];
      el.style.pointerEvents = "none";
      el.style.zIndex = "60";
      layer.appendChild(el);
      pieces.push(el);
    }

    gsap.set(pieces, { opacity: 1, rotate: () => Math.random() * 360 });
    gsap.to(pieces, {
      x: () => (Math.random() - 0.5) * 420,
      y: () => -120 - Math.random() * 260,
      rotate: () => 360 + Math.random() * 720,
      duration: 1.1,
      ease: "power3.out",
      stagger: 0.01,
    });
    gsap.to(pieces, {
      y: `+=${240}`,
      opacity: 0,
      duration: 1.0,
      ease: "power2.in",
      delay: 0.35,
      onComplete: () => {
        for (const el of pieces) el.remove();
      },
    });
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const sb = supabase!;

    let cancelled = false;

    async function load() {
      setError(null);
      const { data, error } = await sb
        .from("reviews")
        .select("id, created_at, name, role, rating, feedback")
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setReviews((data ?? []) as Review[]);
    }

    load();

    const channel = sb
      .channel("reviews-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reviews" },
        (payload) => {
          const next = payload.new as Review;
          setReviews((prev) => {
            if (prev.some((r) => r.id === next.id)) return prev;
            return [next, ...prev].slice(0, 50);
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;

    let onMove: ((e: PointerEvent) => void) | null = null;
    let onLeave: (() => void) | null = null;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.set(".bg-orb", { opacity: 0, scale: 0.9 })
        .to(".bg-orb", {
          opacity: 1,
          scale: 1,
          duration: 1.1,
          stagger: 0.10,
          ease: "power2.out",
        })
        .fromTo(
          ".hero-chip",
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5 },
          "-=0.7"
        )
        .fromTo(
          ".hero-credit",
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5 },
          "-=0.55"
        )
        .fromTo(
          ".hero-counter",
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55 },
          "-=0.55"
        )
        .fromTo(
          ".hero-title",
          { y: 18, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.75 },
          "-=0.35"
        )
        .fromTo(
          ".hero-sub",
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.65 },
          "-=0.45"
        )
        .fromTo(
          ".hero-poster",
          { y: 18, opacity: 0, scale: 0.98 },
          { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" },
          "-=0.35"
        );

      if (cardsRef.current) {
        tl.fromTo(
          cardsRef.current.querySelectorAll(".glass-card"),
          { y: 18, opacity: 0, rotateX: 6 },
          {
            y: 0,
            opacity: 1,
            rotateX: 0,
            duration: 0.9,
            stagger: 0.12,
          },
          "-=0.2"
        );
      }

      gsap.to(".bg-orb", {
        y: (i) => (i % 2 === 0 ? -24 : 24),
        x: (i) => (i % 2 === 0 ? 18 : -18),
        duration: 6,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.3,
      });

      const hasFinePointer =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(pointer:fine)").matches;

      if (hasFinePointer) {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(".glass-card")
        );
        onMove = (e: PointerEvent) => {
          const { innerWidth: w, innerHeight: h } = window;
          const rx = ((e.clientY / h) * 2 - 1) * -4;
          const ry = ((e.clientX / w) * 2 - 1) * 4;
          for (const el of cards) {
            gsap.to(el, {
              rotateX: rx,
              rotateY: ry,
              transformPerspective: 800,
              transformOrigin: "center",
              duration: 0.6,
              ease: "power2.out",
            });
          }
        };

        onLeave = () => {
          for (const el of cards) {
            gsap.to(el, {
              rotateX: 0,
              rotateY: 0,
              duration: 0.8,
              ease: "power2.out",
            });
          }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("mouseleave", onLeave);
      }
    }, rootRef);

    return () => {
      if (onMove) window.removeEventListener("pointermove", onMove);
      if (onLeave) window.removeEventListener("mouseleave", onLeave);
      ctx.revert();
    };
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".dist-bar",
        { scaleX: 0 },
        {
          scaleX: 1,
          transformOrigin: "left",
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.05,
        }
      );
    }, rootRef);
    return () => ctx.revert();
  }, [distribution.total, distribution.avg]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured || !supabase) {
      setError(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment."
      );
      toast.error("Submission failed", {
        description: "Website is not connected to the database yet.",
      });
      return;
    }

    const safeName = name.trim();
    const safeFeedback = feedback.trim();
    const safeRating = clampRating(rating);
    const safeRole = role;

    if (safeName.length < 2) {
      setError("Please enter your name (at least 2 characters).");
      toast.error("Please check your input", {
        description: "Your name must be at least 2 characters.",
      });
      return;
    }
    if (safeFeedback.length < 3) {
      setError("Please write a short feedback (at least 3 characters).");
      toast.error("Please check your input", {
        description: "Your feedback must be at least 3 characters.",
      });
      return;
    }

    const payload: ReviewInsert = {
      name: safeName,
      role: safeRole,
      rating: safeRating,
      feedback: safeFeedback,
    };

    setIsSubmitting(true);
    const { data, error } = await supabase
      .from("reviews")
      .insert(payload)
      .select("id, created_at, name, role, rating, feedback")
      .single();
    setIsSubmitting(false);

    if (error) {
      setError(error.message);
      toast.error("Submission failed", { description: error.message });
      return;
    }

    if (data) {
      const inserted = data as Review;
      setReviews((prev) => {
        if (prev.some((r) => r.id === inserted.id)) return prev;
        return [inserted, ...prev].slice(0, 50);
      });

      toast.success("Thanks! Your feedback was submitted.", {
        description: `You rated ${safeRating}★ as a ${safeRole}.`,
      });

      if (safeRating === 5) {
        burstConfetti();
      }
    }

    setName("");
    setRole("student");
    setRating(5);
    setFeedback("");
  }

  const maxCount = Math.max(
    1,
    ...Object.values(distribution.counts).map((n) => n)
  );

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-[#060611] text-white selection:bg-fuchsia-300 selection:text-black"
    >
      <Toaster richColors position="top-right" />
      <div ref={confettiLayerRef} className="pointer-events-none fixed inset-0" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-orb absolute -left-24 -top-24 h-[440px] w-[440px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="bg-orb absolute right-[-120px] top-24 h-[520px] w-[520px] rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="bg-orb absolute left-1/3 bottom-[-200px] h-[560px] w-[560px] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.10),rgba(0,0,0,0))]" />
      </div>

      <main className="relative mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <header ref={heroRef} className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="hero-chip inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live event feedback
            </div>

            <div className="hero-credit text-xs text-white/55">
              by <span className="text-white/75">Krutarth Raychura</span>
            </div>
          </div>

          <div className="hero-counter mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <span className="text-white/65">Live counter</span>
              <span className="h-4 w-px bg-white/10" />
              <span className="font-semibold tabular-nums">{distribution.total}</span>
              <span className="text-white/65">reviews</span>
              <span className="h-4 w-px bg-white/10" />
              <span className="font-semibold tabular-nums">{distribution.avg}</span>
              <span className="text-white/65">avg</span>
            </div>

            <div className="text-xs text-white/50">Team: {team}</div>
          </div>

          <h1 className="hero-title max-w-full font-semibold tracking-tight whitespace-normal sm:overflow-hidden sm:text-ellipsis sm:whitespace-nowrap [font-size:clamp(1.25rem,2.3vw,2.25rem)]">
            {slogan}
          </h1>
          <p className="hero-sub mt-4 max-w-2xl text-pretty text-base leading-7 text-white/70 sm:text-lg">
            Give a quick review with a star rating and a short message. The graph updates in
            real time as students submit feedback.
          </p>

          <div className="hero-poster mt-8 overflow-hidden rounded-3xl border border-white/10 bg-black/20 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <Image
              src="/Poster.jpeg"
              alt="Event poster"
              width={1024}
              height={768}
              priority
              className="h-auto w-full object-cover"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="glass-card rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
              <div className="text-xs text-white/55">What this slogan means</div>
              <h2 className="mt-2 text-lg font-semibold">
                “Life Without ChatGPT Is Like The Body Without A Soul”
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/75">
                It’s not saying people can’t think without AI. It’s saying that for many of us,
                ChatGPT has become the <span className="text-white/90">missing spark</span>—the thing that
                turns confusion into a plan, and a blank page into a first draft.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/75">
                Like a soul doesn’t replace the body— it <span className="text-white/90">gives it direction</span>.
                In the same way, ChatGPT doesn’t replace students or teachers— it helps them move faster,
                clearer, and with more confidence.
              </p>
            </div>

            <div className="glass-card rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
              <div className="text-xs text-white/55">Real advantages (quick examples)</div>
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">For students</div>
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100/90">
                      Student
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-white/75">
                    <li>
                      <span className="text-white/90">Before exams:</span> you can paste a chapter summary and ask
                      for 10 important questions + answers. It feels like a personal tutor.
                    </li>
                    <li>
                      <span className="text-white/90">Coding help:</span> when a bug wastes hours, you can show the error
                      and get a step-by-step fix (and learn why it happened).
                    </li>
                    <li>
                      <span className="text-white/90">Confidence boost:</span> for speeches, posters, emails— it helps you
                      write something clean instead of overthinking the first line.
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">For teachers</div>
                    <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-2 py-0.5 text-[11px] text-fuchsia-100/90">
                      Teacher
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-white/75">
                    <li>
                      <span className="text-white/90">Lesson planning:</span> convert one topic into a 45‑minute plan with
                      examples, activities, and a quick quiz.
                    </li>
                    <li>
                      <span className="text-white/90">Better explanations:</span> when students don’t get a concept,
                      ask for 3 different explanations—simple, real-life, and technical.
                    </li>
                    <li>
                      <span className="text-white/90">Time saving:</span> drafts of worksheets, rubrics, or feedback comments
                      come faster—so energy goes into teaching, not typing.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </header>

        {!isSupabaseConfigured ? (
          <div className="glass-card mb-10 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 text-amber-50">
            <div className="text-sm font-medium">Supabase not configured</div>
            <div className="mt-1 text-sm text-amber-100/80">
              Create a <code className="rounded bg-black/30 px-1">.env.local</code> file and
              add <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code>
              and <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="glass-card mb-10 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-rose-50">
            <div className="text-sm font-medium">Something went wrong</div>
            <div className="mt-1 text-sm text-rose-100/80">{error}</div>
          </div>
        ) : null}

        <section
          ref={cardsRef}
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          {featuredReview ? (
            <div className="glass-card rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-white/5 to-cyan-400/10 p-6 backdrop-blur sm:p-8 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                    Featured review
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                    Latest 5★ teacher
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold">{featuredReview.name}</div>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                      Teacher
                    </span>
                  </div>
                  <div className="mt-2">
                    <StarsRow rating={5} />
                  </div>
                </div>

                <div className="text-xs text-white/45 tabular-nums">
                  {new Date(featuredReview.created_at).toLocaleString()}
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-white/80">
                {featuredReview.feedback}
              </p>
            </div>
          ) : null}

          <div className="glass-card rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-lg font-semibold">Live rating</h2>
                <p className="mt-1 text-sm text-white/65">
                  Based on the last {distribution.total} submissions
                </p>
              </div>

              <div className="text-right">
                <div className="text-3xl font-semibold tabular-nums">
                  {distribution.avg}
                </div>
                <div className="mt-1 flex justify-end">
                  <StarsRow rating={Math.round(distribution.avg)} />
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {Array.from({ length: 5 }, (_, i) => (i + 1) as 1 | 2 | 3 | 4 | 5)
                .reverse()
                .map((star) => {
                  const count = distribution.counts[star];
                  const widthPct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <div className="w-10 text-sm text-white/70">{star}★</div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="dist-bar h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-300"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <div className="w-10 text-right text-sm tabular-nums text-white/60">
                        {count}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="glass-card rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
            <h2 className="text-lg font-semibold">Leave your feedback</h2>
            <p className="mt-1 text-sm text-white/65">
              No login required. Just be respectful.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-5">
              <label className="block">
                <div className="mb-2 text-sm text-white/75">Your name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Krutarth"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/20 focus:bg-black/40"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm text-white/75">You are</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={
                      "rounded-2xl border px-4 py-3 text-sm font-medium transition " +
                      (role === "student"
                        ? "border-cyan-300/35 bg-cyan-300/10 text-white"
                        : "border-white/10 bg-black/20 text-white/70 hover:border-white/20")
                    }
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={
                      "rounded-2xl border px-4 py-3 text-sm font-medium transition " +
                      (role === "teacher"
                        ? "border-fuchsia-300/35 bg-fuchsia-300/10 text-white"
                        : "border-white/10 bg-black/20 text-white/70 hover:border-white/20")
                    }
                  >
                    Teacher
                  </button>
                </div>
              </label>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white/75">Star rating</div>
                  <button
                    type="button"
                    onClick={() => setSoundOn((v) => !v)}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/20"
                  >
                    Sound: {soundOn ? "On" : "Off"}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const n = i + 1;
                    const isActive = n <= rating;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          playStarClick();
                          setRating(n);
                        }}
                        className={
                          "group inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition " +
                          (isActive
                            ? "border-amber-400/35 bg-amber-400/10"
                            : "border-white/10 bg-black/20 hover:border-white/20")
                        }
                        aria-label={`${n} star`}
                      >
                        <StarIcon filled={isActive} />
                        <span className={isActive ? "text-white" : "text-white/70"}>
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <div className="mb-2 text-sm text-white/75">Feedback</div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Write your thoughts about this slogan..."
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/20 focus:bg-black/40"
                />
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                ref={submitBtnRef}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit feedback"}
              </button>
            </form>
          </div>

          <div className="glass-card rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8 lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Recent feedback</h2>
              <div className="text-sm text-white/60">
                Showing {Math.min(50, filteredReviews.length)} of {reviews.length}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRoleFilter("all")}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition " +
                    (roleFilter === "all"
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 bg-black/20 text-white/70 hover:border-white/20")
                  }
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter("student")}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition " +
                    (roleFilter === "student"
                      ? "border-cyan-300/35 bg-cyan-300/10 text-white"
                      : "border-white/10 bg-black/20 text-white/70 hover:border-white/20")
                  }
                >
                  Students
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter("teacher")}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition " +
                    (roleFilter === "teacher"
                      ? "border-fuchsia-300/35 bg-fuchsia-300/10 text-white"
                      : "border-white/10 bg-black/20 text-white/70 hover:border-white/20")
                  }
                >
                  Teachers
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs text-white/60">Stars:</div>
                {([0, 5, 4, 3, 2, 1] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStarFilter(s)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition " +
                      (starFilter === s
                        ? "border-amber-400/35 bg-amber-400/10 text-white"
                        : "border-white/10 bg-black/20 text-white/70 hover:border-white/20")
                    }
                  >
                    {s === 0 ? "All" : `${s}★`}
                  </button>
                ))}
              </div>
            </div>

            {filteredReviews.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-sm text-white/65">
                No reviews match this filter.
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredReviews.slice(0, 50).map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{r.name}</div>
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                            {r.role === "teacher" ? "Teacher" : "Student"}
                          </span>
                        </div>
                        <div className="mt-1">
                          <StarsRow rating={clampRating(r.rating)} />
                        </div>
                      </div>
                      <div className="text-xs text-white/45 tabular-nums">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-white/75">
                      {r.feedback}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-white/45">
          Built for the slogan event • realtime updates powered by Supabase • designed and developed by Krutarth Raychura
        </footer>
      </main>
    </div>
  );
}
