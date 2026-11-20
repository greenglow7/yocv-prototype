// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { type GetServerSidePropsContext } from "next";
import Head from "next/head";
import { env } from "process";
import { useState, type ReactElement } from "react";
import { IoConstructOutline } from "react-icons/io5";
import type {
  CVBullet,
  CVDraft,
  CVInterviewEntry,
  CVLearningItem,
  CVSkill,
} from "~/api/models/cv";
import { draftCV, getCV } from "~/api/services/cv";
import Suspense from "~/components/Common/Suspense";
import YoID from "~/components/Layout/YoID";
import NoRowsMessage from "~/components/NoRowsMessage";
import { Unauthorized } from "~/components/Status/Unauthorized";
import { YoIDBreadcrumb } from "~/components/YoID/YoIDBreadcrumb";
import { YoIDIntro } from "~/components/YoID/YoIDIntro";
import { userProfileAtom } from "~/lib/store";
import { getServerAuthSession } from "~/server/auth";
import { type NextPageWithLayout } from "../../_app";

/** The four steps and their copy, as in the YoCV spec sections 5 and 12. */
const STEPS = ["Your Yoma record", "Your work", "Review", "Your CV"];
const FOR_WHOM = ["customers", "a family business", "a household", "a community group", "an employer"];
const FREQUENCY = ["daily", "a few times a week", "weekly", "now and then"];
const UNITS = ["customers a day", "customers a week", "items", "people", "trips", "rand a week", "shillings a week"];
const HEDGES = ["exactly", "about", "at least"];
const CONFIRM = ["no one", "a person I can name", "a Yoma completion", "a vouch on my YoCard"];
const MAX_ENTRIES = 3;
const DRAFT_NOTICE = "Draft. Nothing is saved until the person confirms it.";

type Decision = "accepted" | "edited" | "left_out" | "pending";

/** What the browser keeps beside each entry. The place and the confirm chip are never sent to the API. */
interface WorkEntry extends CVInterviewEntry {
  place: string;
  confirm: string;
  completionTitle: string | null;
}

const emptyEntry = (): WorkEntry => ({
  title: "", place: "", what: "", forWhom: null, frequency: null, monthStart: null, monthEnd: null,
  numberValue: null, numberUnit: null, numberHedge: null, outcome: null, confirm: CONFIRM[0]!, completionTitle: null,
});

/** The request holds the interview answers only: no place, no contact detail, no confirm chip. */
const toRequestEntry = ({ place: _p, confirm: _c, completionTitle: _t, ...entry }: WorkEntry): CVInterviewEntry => entry;

const learningLine = (item: CVLearningItem) => {
  const month = item.date ? new Date(item.date).toLocaleDateString("en", { month: "long", year: "numeric" }) : "";
  return item.kind === "credential"
    ? `${item.title}. Credential issued by ${item.issuer || "issuer not stated"}, ${month}.`
    : `${item.title}. Learning opportunity completed with ${item.issuer}, ${month}.`;
};

const download = (name: string, type: string, body: string) => {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const session = await getServerAuthSession(context);

  // 👇 ensure authenticated
  if (!session) {
    return {
      props: {
        error: "Unauthorized",
      },
    };
  }

  // check if the CV builder is enabled
  const cv_enabled =
    env.NEXT_PUBLIC_CV_ENABLED?.toLowerCase() == "true" ? true : false;

  if (!cv_enabled)
    return {
      props: { cv_enabled },
    };

  return {
    props: {
      user: session?.user ?? null,
      cv_enabled,
    },
  };
}

const MyCV: NextPageWithLayout<{
  error: string;
  cv_enabled: boolean;
}> = ({ error, cv_enabled }) => {
  const userProfile = useAtomValue(userProfileAtom);
  const [step, setStep] = useState(0);
  const [role, setRole] = useState("");
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [entries, setEntries] = useState<WorkEntry[]>([emptyEntry()]);
  // null phone or email means "as on the profile", so the prefill shows until the person types.
  const [contact, setContact] = useState<{ phone: string | null; email: string | null; town: string; education: string }>(
    { phone: null, email: null, town: "", education: "" },
  );
  const [draft, setDraft] = useState<CVDraft | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [handAdded, setHandAdded] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");

  const {
    data: record,
    error: recordError,
    isLoading: recordIsLoading,
  } = useQuery({
    queryKey: ["CV", "Record"],
    queryFn: () => getCV(),
    enabled: !error && cv_enabled,
  });

  const draftMutation = useMutation({
    mutationFn: () => draftCV({ role, entries: entries.map(toRequestEntry) }),
    onSuccess: (result) => {
      setDraft(result);
      setDecisions({});
      setStep(2);
    },
  });

  if (error) return <Unauthorized />;

  if (!cv_enabled)
    return (
      <>
        <Head>
          <title>Yoma | CV Unavailable</title>
        </Head>

        <div className="container flex max-w-7xl flex-col items-center justify-center">
          <NoRowsMessage
            title={"Coming soon"}
            description={"The CV builder is not open yet. Thanks for your patience."}
            icon={<IoConstructOutline aria-hidden className="text-green h-5 w-5" />}
          />
        </div>
      </>
    );

  const learning = record?.learning ?? [];
  const ticked = learning.filter((item) => include[item.title]);
  const completions = ticked.filter((item) => item.kind === "completion");
  const keyOf = (bullet: CVBullet, i: number) => `${bullet.entryIndex}:${i}`;
  const decide = (key: string, decision: Decision) => setDecisions((d) => ({ ...d, [key]: decision }));
  const setEntry = (i: number, patch: Partial<WorkEntry>) =>
    setEntries((list) => list.map((e, n) => (n === i ? { ...e, ...patch } : e)));

  // Nothing reaches the CV without an Accept.
  const acceptedBullets = (draft?.bullets ?? []).filter((b, i) => decisions[keyOf(b, i)] === "accepted");
  const skills: CVSkill[] = [
    ...(record?.skills ?? []),
    ...(draft?.skills ?? []).filter((s) => !(record?.skills ?? []).some((r) => r.name === s.name)),
  ];
  const acceptedSkills = [
    ...skills.filter((s) => decisions[`skill:${s.name}`] === "accepted"),
    ...handAdded.map((name) => ({ name, label: "Self-stated" })),
  ];
  const name = [userProfile?.firstName, userProfile?.surname].filter(Boolean).join(" ");
  const phone = contact.phone ?? userProfile?.phoneNumber ?? "";
  const email = contact.email ?? userProfile?.email ?? "";

  const cvText = () =>
    [
      name,
      [phone, email, contact.town].filter(Boolean).join(" · "),
      "",
      "Experience",
      ...entries.flatMap((e, i) => [
        [e.title, e.place].filter(Boolean).join(", "),
        ...acceptedBullets.filter((b) => b.entryIndex === i).map((b) => `- ${b.text}`),
      ]),
      "",
      "Skills",
      ...acceptedSkills.map((s) => `${s.name} (${s.label})`),
      "",
      "Learning recorded on Yoma",
      ...ticked.map(learningLine),
      ...(contact.education ? ["", "Education", contact.education] : []),
    ].join("\n");

  const evidenceRecord = () =>
    JSON.stringify(
      {
        generation: draft ? { mode: draft.mode, provider: draft.provider, model: draft.model } : null,
        role,
        entries: entries.map(({ place: _p, ...e }) => e),
        bullets: (draft?.bullets ?? []).map((b, i) => ({ ...b, decision: decisions[keyOf(b, i)] ?? "pending" })),
        rejected: draft?.rejected ?? [],
        skills: skills.map((s) => ({ ...s, decision: decisions[`skill:${s.name}`] ?? "pending" })),
        handAdded,
        learning: ticked,
      },
      null,
      2,
    );

  return (
    <>
      <Head>
        <title>Yoma | CV</title>
      </Head>

      <YoIDBreadcrumb trail={[{ title: "CV" }]} />
      <YoIDIntro>
        Build a CV from what Yoma holds and from your own words. {DRAFT_NOTICE}
      </YoIDIntro>

      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {STEPS.map((title, i) => (
          <li key={title} aria-current={i === step ? "step" : undefined}
            className={`rounded-full px-4 py-1 ${i === step ? "bg-green text-white" : "bg-gray-light"}`}>
            {`Step ${i + 1} of ${STEPS.length}: ${title}`}
          </li>
        ))}
      </ol>

      {/* STEP 1: YOUR YOMA RECORD. Nothing here is editable. */}
      {step === 0 && (
        <Suspense isLoading={recordIsLoading} error={recordError}>
          <section className="flex flex-col gap-4 rounded-lg bg-white p-4 shadow">
            <h2 className="font-semibold">Confirmed from Yoma</h2>
            {record?.walletNotice && <p className="text-gray-dark text-sm">{record.walletNotice}</p>}
            <ul className="flex flex-col gap-2">
              {learning.map((item) => (
                <li key={item.title}>
                  <label className="flex gap-2">
                    <input type="checkbox" className="checkbox" checked={!!include[item.title]}
                      onChange={(e) => setInclude((s) => ({ ...s, [item.title]: e.target.checked }))} />
                    <span>{learningLine(item)}{item.skills.length > 0 && ` Skills: ${item.skills.join(", ")}.`}</span>
                  </label>
                </li>
              ))}
            </ul>
            {(record?.skills ?? []).length > 0 && (
              <p className="text-sm">{(record?.skills ?? []).map((s) => `${s.name} (${s.label})`).join(", ")}</p>
            )}
            <label className="flex flex-col gap-1">
              <span>The role you are working towards</span>
              <input className="input input-bordered" value={role} maxLength={60} onChange={(e) => setRole(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary rounded-full normal-case" disabled={!role.trim()} onClick={() => setStep(1)}>
              Next
            </button>
          </section>
        </Suspense>
      )}

      {/* STEP 2: YOUR WORK. Up to three entries, then the contact details, which never go to the API. */}
      {step === 1 && (
        <section className="flex flex-col gap-4">
          {entries.map((entry, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow">
              <input className="input input-bordered" placeholder="The work in two or three words" maxLength={60}
                value={entry.title} onChange={(e) => setEntry(i, { title: e.target.value })} />
              <input className="input input-bordered" placeholder="Town or area (optional)" maxLength={60}
                value={entry.place} onChange={(e) => setEntry(i, { place: e.target.value })} />
              <label className="flex flex-col gap-1">
                <span>What did you do?</span>
                <textarea className="textarea textarea-bordered" minLength={20} maxLength={400}
                  value={entry.what} onChange={(e) => setEntry(i, { what: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span>For whom, or where?</span>
                <select className="select select-bordered" value={entry.forWhom ?? ""} onChange={(e) => setEntry(i, { forWhom: e.target.value || null })}>
                  <option value="" />
                  {FOR_WHOM.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <fieldset className="flex flex-wrap gap-2">
                <legend>How often, and for how long?</legend>
                <select className="select select-bordered" value={entry.frequency ?? ""} onChange={(e) => setEntry(i, { frequency: e.target.value || null })}>
                  <option value="" />
                  {FREQUENCY.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input type="month" className="input input-bordered" aria-label="Start month" value={entry.monthStart ?? ""}
                  onChange={(e) => setEntry(i, { monthStart: e.target.value || null })} />
                <input type="month" className="input input-bordered" aria-label="End month, empty if you still do it" value={entry.monthEnd ?? ""}
                  onChange={(e) => setEntry(i, { monthEnd: e.target.value || null })} />
              </fieldset>
              <fieldset className="flex flex-wrap gap-2">
                <legend>A number you can stand behind</legend>
                <input inputMode="numeric" pattern="[0-9]*" className="input input-bordered w-28" value={entry.numberValue ?? ""}
                  onChange={(e) => setEntry(i, { numberValue: e.target.value.replace(/\D/g, "") || null })} />
                <select className="select select-bordered" value={entry.numberUnit ?? ""} onChange={(e) => setEntry(i, { numberUnit: e.target.value || null })}>
                  <option value="" />
                  {UNITS.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="select select-bordered" value={entry.numberHedge ?? ""} onChange={(e) => setEntry(i, { numberHedge: e.target.value || null })}>
                  <option value="" />
                  {HEDGES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </fieldset>
              <label className="flex flex-col gap-1">
                <span>What was better because of you?</span>
                <textarea className="textarea textarea-bordered" maxLength={200}
                  value={entry.outcome ?? ""} onChange={(e) => setEntry(i, { outcome: e.target.value || null })} />
              </label>
              <label className="flex flex-col gap-1">
                <span>Who could confirm this?</span>
                <select className="select select-bordered" value={entry.confirm} onChange={(e) => setEntry(i, { confirm: e.target.value, completionTitle: null })}>
                  {CONFIRM.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              {entry.confirm === "a Yoma completion" && (
                <select className="select select-bordered" aria-label="Which Yoma completion?" value={entry.completionTitle ?? ""}
                  onChange={(e) => setEntry(i, { completionTitle: e.target.value || null })}>
                  <option value="" />
                  {completions.map((c) => <option key={c.title}>{c.title}</option>)}
                </select>
              )}
            </div>
          ))}
          {entries.length < MAX_ENTRIES && (
            <button type="button" className="btn btn-outline rounded-full normal-case" onClick={() => setEntries((l) => [...l, emptyEntry()])}>
              Add another piece of work
            </button>
          )}
          <fieldset className="flex flex-col gap-2 rounded-lg bg-white p-4 shadow">
            <legend>Contact details, for the CV only</legend>
            <input className="input input-bordered" placeholder="Phone" value={phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
            <input className="input input-bordered" placeholder="Email" value={email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
            <input className="input input-bordered" placeholder="Town" value={contact.town}
              onChange={(e) => setContact((c) => ({ ...c, town: e.target.value }))} />
            <input className="input input-bordered" placeholder="Education (optional)" value={contact.education}
              onChange={(e) => setContact((c) => ({ ...c, education: e.target.value }))} />
          </fieldset>
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline rounded-full normal-case" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="btn btn-primary rounded-full normal-case" disabled={draftMutation.isPending}
              onClick={() => draftMutation.mutate()}>
              Next
            </button>
          </div>
          {draftMutation.isError && <p role="alert">Some of what was sent is missing or not in the right form.</p>}
        </section>
      )}

      {/* STEP 3: REVIEW. The person's own answer beside each proposed sentence. */}
      {step === 2 && draft && (
        <section className="flex flex-col gap-4">
          <p className="text-sm">{draft.notice}</p>
          {draft.bullets.map((bullet, i) => {
            const key = keyOf(bullet, i);
            return (
              <div key={key} className="grid gap-2 rounded-lg bg-white p-4 shadow md:grid-cols-2">
                <blockquote className="text-gray-dark">{entries[bullet.entryIndex]?.what}</blockquote>
                <div className="flex flex-col gap-2">
                  <p>{bullet.text}</p>
                  {bullet.templateWording && <p className="text-xs">template wording</p>}
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-sm rounded-full normal-case" aria-pressed={decisions[key] === "accepted"} onClick={() => decide(key, "accepted")}>Accept</button>
                    {/* An edit must pass CVService.CheckBullet before it reaches the CV. The API has no endpoint
                        for that check yet (see the feature doc), so Edit stays off until it does. */}
                    <button type="button" className="btn btn-sm rounded-full normal-case" disabled title="Editing needs the wording check on the server.">Edit</button>
                    <button type="button" className="btn btn-sm rounded-full normal-case" aria-pressed={decisions[key] === "left_out"} onClick={() => decide(key, "left_out")}>Leave out</button>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex flex-col gap-2 rounded-lg bg-white p-4 shadow">
            <h2 className="font-semibold">Skills</h2>
            {skills.map((skill) => {
              const key = `skill:${skill.name}`;
              return (
                <div key={key} className="flex flex-wrap items-center gap-2">
                  <span>{`${skill.name} (${skill.label})`}</span>
                  <button type="button" className="btn btn-xs rounded-full normal-case" aria-pressed={decisions[key] === "accepted"} onClick={() => decide(key, "accepted")}>Accept</button>
                  <button type="button" className="btn btn-xs rounded-full normal-case" aria-pressed={decisions[key] === "left_out"} onClick={() => decide(key, "left_out")}>Leave out</button>
                </div>
              );
            })}
            <div className="flex gap-2">
              <input className="input input-bordered input-sm" placeholder="Add a skill" maxLength={60} value={newSkill} onChange={(e) => setNewSkill(e.target.value)} />
              <button type="button" className="btn btn-sm rounded-full normal-case" disabled={!newSkill.trim()}
                onClick={() => { setHandAdded((l) => [...l, newSkill.trim()]); setNewSkill(""); }}>
                Add
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline rounded-full normal-case" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn btn-primary rounded-full normal-case" onClick={() => setStep(3)}>Next</button>
          </div>
        </section>
      )}

      {/* STEP 4: YOUR CV. Only accepted lines; learning listed as what it is, never as a qualification. */}
      {step === 3 && (
        <section className="flex flex-col gap-4">
          <article className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow print:shadow-none">
            <h1 className="text-xl font-bold">{name}</h1>
            <p className="text-sm">{[phone, email, contact.town].filter(Boolean).join(" · ")}</p>
            <h2 className="font-semibold">Experience</h2>
            {entries.map((entry, i) => (
              <div key={i}>
                <h3 className="font-semibold">{[entry.title, entry.place].filter(Boolean).join(", ")}</h3>
                <ul className="list-disc pl-5">
                  {acceptedBullets.filter((b) => b.entryIndex === i).map((b, n) => <li key={n}>{b.text}</li>)}
                </ul>
              </div>
            ))}
            <h2 className="font-semibold">Skills</h2>
            <ul>{acceptedSkills.map((s) => <li key={s.name}>{`${s.name} (${s.label})`}</li>)}</ul>
            {ticked.length > 0 && (
              <>
                <h2 className="font-semibold">Learning recorded on Yoma</h2>
                <ul>{ticked.map((item) => <li key={item.title}>{learningLine(item)}</li>)}</ul>
              </>
            )}
            {contact.education && (
              <>
                <h2 className="font-semibold">Education</h2>
                <p>{contact.education}</p>
              </>
            )}
          </article>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" className="btn btn-outline rounded-full normal-case" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="btn btn-primary rounded-full normal-case" onClick={() => window.print()}>Print or save as PDF</button>
            <button type="button" className="btn btn-outline rounded-full normal-case" onClick={() => download("cv.txt", "text/plain", cvText())}>Download text</button>
            <button type="button" className="btn btn-outline rounded-full normal-case" onClick={() => download("cv-evidence-record.json", "application/json", evidenceRecord())}>
              Download evidence record
            </button>
          </div>
        </section>
      )}
    </>
  );
};

MyCV.getLayout = function getLayout(page: ReactElement) {
  return <YoID>{page}</YoID>;
};

export default MyCV;
