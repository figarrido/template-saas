import Link from 'next/link';
import {
  Users,
  BarChart3,
  FileText,
  Inbox,
  Plus,
  Download,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Badge,
  Avatar,
  Separator,
  Skeleton,
  Spinner,
  Heading,
  Text,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Alert,
  AlertTitle,
  AlertDescription,
  StatCard,
  PageHeader,
  EmptyState,
  Field,
  FieldLabel,
  FieldError,
} from '@template/ui';
import { SearchDemo } from './_components/interactive-demos';
import { StateMatrix } from './_components/state-matrix';

// ─── layout helpers ──────────────────────────────────────────────────────────

function Section({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-6">
      <div className="space-y-1">
        <Heading as="h2" size="h3">
          {label}
        </Heading>
        <Separator />
      </div>
      {children}
    </section>
  );
}

function SubSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function ShowCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {title && <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>}
      {children}
    </div>
  );
}

// ─── nav items ───────────────────────────────────────────────────────────────

const NAV = [
  { href: '#states', label: 'State coverage' },
  { href: '#atoms', label: 'Atoms' },
  { href: '#molecules', label: 'Molecules' },
  { href: '#organisms', label: 'Organisms' },
];

// ─── page ────────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* sticky nav */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="text-sm font-semibold text-foreground hover:underline">
            ← Back
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-16 px-4 py-12 sm:px-6">
        {/* hero */}
        <div className="space-y-2">
          <Heading as="h1" size="h1">
            Design System
          </Heading>
          <Text variant="muted" size="lg">
            Atomic components — atoms → molecules → organisms — ready to compose
            any page.
          </Text>
        </div>

        {/* ── STATE COVERAGE ────────────────────────────────────── */}
        <Section id="states" label="Component state coverage">
          <StateMatrix />
        </Section>

        {/* ── ATOMS ─────────────────────────────────────────────── */}
        <Section id="atoms" label="Atoms">

          {/* Buttons */}
          <ShowCard title="Button · variants">
            <SubSection title="Variants">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </SubSection>
            <Separator />
            <SubSection title="Sizes">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Add"><Plus className="h-4 w-4" /></Button>
            </SubSection>
            <Separator />
            <SubSection title="States">
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>Outline disabled</Button>
              <Button>
                <Spinner size="sm" className="mr-2" />
                Loading
              </Button>
            </SubSection>
          </ShowCard>

          {/* Badges */}
          <ShowCard title="Badge · variants">
            <SubSection title="Variants">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </SubSection>
          </ShowCard>

          {/* Avatars */}
          <ShowCard title="Avatar · sizes + fallback">
            <SubSection title="Sizes">
              <Avatar size="sm" initials="AB" alt="Alice Brown" />
              <Avatar size="md" initials="CD" alt="Charlie Davis" />
              <Avatar size="lg" initials="EF" alt="Emma Ford" />
              <Avatar size="xl" initials="GH" alt="George Harris" />
            </SubSection>
            <Separator />
            <SubSection title="With image">
              <Avatar
                size="md"
                src="https://github.com/shadcn.png"
                alt="shadcn"
                initials="SC"
              />
              <Avatar
                size="md"
                src="/broken-image.png"
                alt="Fallback"
                initials="FB"
              />
            </SubSection>
          </ShowCard>

          {/* Typography */}
          <ShowCard title="Typography">
            <div className="space-y-3">
              <Heading as="h1" size="h1">Heading 1 — 36px</Heading>
              <Heading as="h2" size="h2">Heading 2 — 30px</Heading>
              <Heading as="h3" size="h3">Heading 3 — 24px</Heading>
              <Heading as="h4" size="h4">Heading 4 — 20px</Heading>
              <Separator />
              <Text size="lg">Large text — 18px default colour</Text>
              <Text size="base">Base text — 16px default colour</Text>
              <Text size="sm" variant="muted">Small muted text — 14px</Text>
              <Text size="sm" variant="destructive">Small destructive text</Text>
            </div>
          </ShowCard>

          {/* Input + Label */}
          <ShowCard title="Input + Label">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email-demo">Email</FieldLabel>
                <Input id="email-demo" type="email" placeholder="you@example.com" />
              </Field>
              <Field>
                <FieldLabel htmlFor="disabled-demo">Disabled</FieldLabel>
                <Input id="disabled-demo" placeholder="Can't touch this" disabled />
              </Field>
              <Field>
                <FieldLabel htmlFor="password-demo">Password</FieldLabel>
                <Input id="password-demo" type="password" placeholder="••••••••" />
              </Field>
              <Field>
                <FieldLabel htmlFor="error-demo">With error</FieldLabel>
                <Input
                  id="error-demo"
                  placeholder="bad value"
                  aria-invalid
                  className="border-destructive focus-visible:ring-destructive"
                />
                <FieldError message="This field is required." />
              </Field>
            </div>
          </ShowCard>

          {/* Separator */}
          <ShowCard title="Separator">
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">Horizontal</div>
              <Separator />
              <div className="flex h-8 items-center gap-4 text-sm text-muted-foreground">
                <span>Item A</span>
                <Separator orientation="vertical" />
                <span>Item B</span>
                <Separator orientation="vertical" />
                <span>Item C</span>
              </div>
            </div>
          </ShowCard>

          {/* Skeleton */}
          <ShowCard title="Skeleton · loading placeholder">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
          </ShowCard>

          {/* Spinner */}
          <ShowCard title="Spinner · sizes">
            <SubSection title="Sizes">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </SubSection>
            <Separator />
            <SubSection title="Inside a button">
              <Button variant="outline">
                <Spinner size="sm" className="mr-2" />
                Saving…
              </Button>
            </SubSection>
          </ShowCard>

        </Section>

        {/* ── MOLECULES ─────────────────────────────────────────── */}
        <Section id="molecules" label="Molecules">

          {/* Alert */}
          <ShowCard title="Alert · variants">
            <div className="space-y-3">
              <Alert variant="info">
                <AlertTitle>Heads up</AlertTitle>
                <AlertDescription>
                  Your trial ends in 3 days. Upgrade to keep access.
                </AlertDescription>
              </Alert>
              <Alert variant="success">
                <AlertTitle>Payment received</AlertTitle>
                <AlertDescription>
                  Invoice #1024 was paid successfully.
                </AlertDescription>
              </Alert>
              <Alert variant="warning">
                <AlertTitle>Action required</AlertTitle>
                <AlertDescription>
                  Please verify your email before continuing.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>
                  Your changes could not be saved. Try again or contact support.
                </AlertDescription>
              </Alert>
            </div>
          </ShowCard>

          {/* StatCard */}
          <ShowCard title="StatCard · metrics">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total revenue"
                value="$48,295"
                trend={{ value: 12.5, label: 'vs last month' }}
                icon={<BarChart3 className="h-5 w-5" />}
              />
              <StatCard
                title="Active users"
                value="2,340"
                trend={{ value: -3.2, label: 'vs last month' }}
                icon={<Users className="h-5 w-5" />}
              />
              <StatCard
                title="Open invoices"
                value="14"
                description="Awaiting payment"
                icon={<FileText className="h-5 w-5" />}
              />
              <StatCard
                title="Unread messages"
                value="0"
                trend={{ value: 0 }}
                icon={<Inbox className="h-5 w-5" />}
              />
            </div>
          </ShowCard>

          {/* SearchInput */}
          <ShowCard title="SearchInput · interactive">
            <SearchDemo />
          </ShowCard>

          {/* Card */}
          <ShowCard title="Card · anatomy">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Basic card</CardTitle>
                  <CardDescription>
                    Header, content, and footer together.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Text size="sm" variant="muted">
                    The card body goes here. It can hold any content.
                  </Text>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm">Confirm</Button>
                  <Button size="sm" variant="ghost">Cancel</Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>With badge</CardTitle>
                  <CardDescription>Cards can host any atom.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge>Active</Badge>
                  <Badge variant="secondary">Pending</Badge>
                  <Badge variant="outline">Draft</Badge>
                </CardContent>
              </Card>
            </div>
          </ShowCard>

        </Section>

        {/* ── ORGANISMS ─────────────────────────────────────────── */}
        <Section id="organisms" label="Organisms">

          {/* PageHeader */}
          <ShowCard title="PageHeader · responsive header with actions">
            <div className="space-y-6">
              <PageHeader
                title="Team members"
                description="Manage who has access to your workspace."
                actions={
                  <>
                    <Button variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Invite member
                    </Button>
                  </>
                }
              />
              <Separator />
              <PageHeader
                title="Settings"
                description="Manage your account preferences."
              />
            </div>
          </ShowCard>

          {/* EmptyState */}
          <ShowCard title="EmptyState · empty content placeholder">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/20">
                <EmptyState
                  icon={<Inbox className="h-8 w-8" />}
                  title="No messages yet"
                  description="When you receive messages they will show up here."
                  action={
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      New message
                    </Button>
                  }
                />
              </div>
              <div className="rounded-md border bg-muted/20">
                <EmptyState
                  icon={<Trash2 className="h-8 w-8" />}
                  title="Nothing here"
                  description="This list is empty."
                />
              </div>
            </div>
          </ShowCard>

          {/* Full page skeleton */}
          <ShowCard title="Page skeleton · loading state">
            <div className="space-y-6 rounded-lg border p-6">
              {/* fake page header */}
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-72" />
                </div>
                <Skeleton className="h-10 w-28 rounded-md" />
              </div>
              <Separator />
              {/* fake stat cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[...Array<number>(4)].map((_, i) => (
                  <div key={i} className="rounded-lg border p-4 space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
              {/* fake list */}
              {[...Array<number>(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </ShowCard>

        </Section>

        {/* footer */}
        <footer className="border-t pt-8 pb-4">
          <Text size="sm" variant="muted" className="text-center">
            Components live in <code className="rounded bg-muted px-1 py-0.5">packages/ui</code>.
            Add shadcn primitives with{' '}
            <code className="rounded bg-muted px-1 py-0.5">pnpm ui:add &lt;component&gt;</code>.
          </Text>
        </footer>
      </main>
    </div>
  );
}
