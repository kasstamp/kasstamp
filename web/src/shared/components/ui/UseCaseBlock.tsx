import React from 'react';
import { Card, CardContent, CardHeader } from './Card';
import {
  FileText,
  Twitter,
  Copyright,
  FlaskConical,
  Scale,
  Code2,
  Truck,
  GraduationCap,
  Newspaper,
  Stethoscope,
  Pencil,
  Building2,
  Bug,
  CheckCircle,
  ScrollText,
  Server,
  History,
  Image as ImageIcon,
} from 'lucide-react';

type UseCase = {
  title: string;
  description: string;
  Icon: React.ElementType;
};

const USE_CASES: UseCase[] = [
  {
    title: 'Prove Digital Exchanges',
    description:
      'Attach verifiable evidence to shared messages, files, or images, proving their existence at a specific time.',
    Icon: ImageIcon,
  },
  {
    title: 'Notarized Records',
    description:
      'Create tamper-evident proofs for contracts, powers of attorney, or official documents.',
    Icon: ScrollText,
  },
  {
    title: 'Verify Online Posts',
    description:
      'Prove that a tweet or thread existed at a specific time, even if later edited or removed.',
    Icon: Twitter,
  },
  {
    title: 'Copyright and Priority',
    description:
      'Establish priority for texts, designs, photos, or music with verifiable time evidence.',
    Icon: Copyright,
  },
  {
    title: 'Research Integrity',
    description:
      'Anchor datasets, results, and analyses with immutable proofs for reproducibility.',
    Icon: FlaskConical,
  },
  {
    title: 'Legal and Compliance',
    description:
      'Version policies, terms, and disclosures with verifiable change and timing evidence.',
    Icon: Scale,
  },
  {
    title: 'Software Provenance',
    description: 'Prove the existence and integrity of source code, builds, or configurations.',
    Icon: Code2,
  },
  {
    title: 'Supply Chain Proofs',
    description: 'Record handovers, checks, and events with time-stamped, tamper-evident proofs.',
    Icon: Truck,
  },
  {
    title: 'Academic Priority',
    description: 'Prove submission times for research papers, preprints, and datasets.',
    Icon: GraduationCap,
  },
  {
    title: 'Media Provenance',
    description: 'Attach timestamp evidence to articles, photos, and source materials.',
    Icon: Newspaper,
  },
  {
    title: 'Healthcare Records',
    description:
      'Protect integrity of diagnostic results and reports without revealing private data.',
    Icon: Stethoscope,
  },
  {
    title: 'Creative Milestones',
    description: 'Capture verifiable progress of designs, lyrics, or other creative assets.',
    Icon: Pencil,
  },
  {
    title: 'Construction Records',
    description: 'Stamp inspections, changes, and site reports throughout a project’s lifecycle.',
    Icon: Building2,
  },
  {
    title: 'Security Disclosure',
    description: 'Timestamp vulnerabilities or proofs-of-concept to establish reporting order.',
    Icon: Bug,
  },
  {
    title: 'Education Credentials',
    description: 'Issue certificates or micro-credentials with tamper-evident proofs.',
    Icon: CheckCircle,
  },
  {
    title: 'Historical Evidence',
    description: 'Anchor key documents and records so their existence remains provable over time.',
    Icon: FileText,
  },
  {
    title: 'Civic Infrastructure',
    description: 'Safeguard public procedures or configurations with verifiable proofs.',
    Icon: Server,
  },
  {
    title: 'Web Provenance',
    description: 'Document and verify website versions and changes over time.',
    Icon: History,
  },
];

function Row({
  items,
  reverse,
  speed = 40,
}: {
  items: UseCase[];
  reverse?: boolean;
  speed?: number;
}) {
  return (
    <div className="group relative">
      {/* Left gradient mask - fixed position */}
      <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--background)] to-transparent sm:w-32" />
      {/* Right gradient mask - fixed position */}
      <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-16 bg-gradient-to-l from-[var(--background)] to-transparent sm:w-32" />

      <div
        className={`scrollbar-hide snap-x snap-mandatory overflow-x-auto overflow-y-visible`}
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        aria-label="Use cases"
        role="region"
      >
        <div
          className={`marquee-track ${reverse ? 'marquee-right' : 'marquee-left'} flex w-max whitespace-nowrap`}
          style={{ '--marquee-speed': `${speed}s` } as React.CSSProperties}
        >
          {/* Original Segment */}
          <div className="flex shrink-0 gap-3 sm:gap-4">
            {items.map((uc, idx) => (
              <div
                key={`a-${uc.title}-${idx}`}
                className="inline-flex w-[300px] min-w-[280px] flex-none snap-start align-top sm:w-[340px] sm:min-w-[320px]"
              >
                <Card className="pointer-events-auto w-full overflow-hidden transition-shadow hover:shadow-md">
                  <CardHeader className="font-medium break-words whitespace-normal">
                    <div className="flex items-center gap-2">
                      <uc.Icon className="h-5 w-5 text-emerald-600" aria-hidden />
                      <span>{uc.title}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="break-words whitespace-normal text-gray-600 dark:text-gray-300">
                    {uc.description}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
          {/* Kopie für nahtlose Wiederholung (mit Abstand zum Original) */}
          <div className="ml-3 flex shrink-0 gap-3 sm:ml-4 sm:gap-4" aria-hidden>
            {items.map((uc, idx) => (
              <div
                key={`b-${uc.title}-${idx}`}
                className="inline-flex w-[300px] min-w-[280px] flex-none snap-start align-top sm:w-[340px] sm:min-w-[320px]"
              >
                <Card className="pointer-events-auto w-full overflow-hidden transition-shadow hover:shadow-md">
                  <CardHeader className="font-medium break-words whitespace-normal">
                    <div className="flex items-center gap-2">
                      <uc.Icon className="h-5 w-5 text-emerald-600" aria-hidden />
                      <span>{uc.title}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="break-words whitespace-normal text-gray-600 dark:text-gray-300">
                    {uc.description}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UseCaseBlock() {
  // Split into rows of ~5-6 items each for variety
  const rowSize = 5;
  const rows: UseCase[][] = [];
  for (let i = 0; i < USE_CASES.length; i += rowSize) {
    rows.push(USE_CASES.slice(i, i + rowSize));
  }
  const limitedRows = rows.slice(0, 2);

  return (
    <section className="full-bleed px-3 sm:px-4">
      <div className="mt-2 grid gap-3">
        <h2 className="text-center text-xl font-semibold">Use Cases</h2>
        <p className="text-center text-gray-600 dark:text-gray-300">
          Some examples of what KasStamp is useful for.
        </p>
      </div>
      <div className="mt-4 space-y-3 sm:space-y-4">
        {limitedRows.map((items, index) => (
          <Row key={index} items={items} reverse={index % 2 === 1} speed={38 + (index % 3) * 6} />
        ))}
      </div>
    </section>
  );
}

export default UseCaseBlock;
