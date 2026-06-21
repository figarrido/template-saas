import * as React from 'react';
import {
  Button,
  Input,
  Badge,
  Avatar,
  Spinner,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
  StatCard,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  SearchInput,
  PageHeader,
  EmptyState,
  cn,
} from '@template/ui';
import { BarChart3, Users, FileWarning, Plus, Inbox } from 'lucide-react';

// ─── status system ───────────────────────────────────────────────────────────

type Status = 'prop' | 'css' | 'composed' | 'n/a';

const STATUS_META: Record<Status, { label: string; cls: string; hint: string }> = {
  prop:     { label: 'prop',     cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300', hint: 'controlled by a component prop' },
  css:      { label: 'CSS',      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',   hint: 'CSS pseudo-class (:hover / :focus)' },
  composed: { label: 'composed', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', hint: 'achieved via className or component composition' },
  'n/a':    { label: 'N/A',      cls: 'bg-muted text-muted-foreground',                                   hint: 'not applicable' },
};

function StatusPill({ status }: { status: Status }) {
  const { label, cls } = STATUS_META[status];
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', cls)}>
      {label}
    </span>
  );
}

function StateCell({ label, status, children }: { label: string; status: Status; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <StatusPill status={status} />
      </div>
      <div className="flex items-start">{children}</div>
    </div>
  );
}

function ComponentBlock({ name, note, children }: { name: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{name}</p>
        {note && <p className="text-xs text-muted-foreground/70 italic">{note}</p>}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-6">{children}</div>
    </div>
  );
}

// ─── matrix ──────────────────────────────────────────────────────────────────

export function StateMatrix() {
  return (
    <div className="space-y-4">

      {/* legend */}
      <div className="flex flex-wrap items-start gap-3 rounded-md border bg-muted/30 p-3 text-xs">
        <span className="font-semibold text-muted-foreground pt-0.5">Key:</span>
        {(Object.keys(STATUS_META) as Status[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <StatusPill status={s} />
            <span className="text-muted-foreground">{STATUS_META[s].hint}</span>
          </span>
        ))}
      </div>

      {/* ── Button ─────────────────────────────────── */}
      <ComponentBlock name="Button">
        <StateCell label="Idle" status="prop">
          <Button>Click me</Button>
        </StateCell>
        <StateCell label="Hover" status="css">
          <Button className="bg-primary/80 dark:bg-primary/70">Hover sim.</Button>
        </StateCell>
        <StateCell label="Focus" status="css">
          <Button className="ring-2 ring-ring ring-offset-2">Focused</Button>
        </StateCell>
        <StateCell label="Disabled" status="prop">
          <Button disabled>Disabled</Button>
        </StateCell>
        <StateCell label="Loading" status="composed">
          <Button disabled>
            <Spinner size="sm" className="mr-2" />
            Saving…
          </Button>
        </StateCell>
        <StateCell label="Destructive" status="prop">
          <Button variant="destructive">Delete</Button>
        </StateCell>
        <StateCell label="Outline" status="prop">
          <Button variant="outline">Cancel</Button>
        </StateCell>
        <StateCell label="Ghost" status="prop">
          <Button variant="ghost">More</Button>
        </StateCell>
        <StateCell label="Link" status="prop">
          <Button variant="link">Learn more</Button>
        </StateCell>
      </ComponentBlock>

      {/* ── Input ──────────────────────────────────── */}
      <ComponentBlock name="Input" note="error + success states use className overrides">
        <StateCell label="Idle" status="prop">
          <Input placeholder="Type here…" className="w-40" />
        </StateCell>
        <StateCell label="Focus" status="css">
          <Input placeholder="Focused" className="w-40 ring-2 ring-ring ring-offset-2" />
        </StateCell>
        <StateCell label="Filled" status="css">
          <Input defaultValue="Hello world" className="w-40" />
        </StateCell>
        <StateCell label="Read-only" status="prop">
          <Input readOnly value="Read only" className="w-40 cursor-default" />
        </StateCell>
        <StateCell label="Disabled" status="prop">
          <Input disabled placeholder="Disabled" className="w-40" />
        </StateCell>
        <StateCell label="Error" status="composed">
          <Input
            aria-invalid
            placeholder="Invalid value"
            className="w-40 border-destructive focus-visible:ring-destructive"
          />
        </StateCell>
        <StateCell label="Success" status="composed">
          <Input
            defaultValue="Valid ✓"
            className="w-40 border-green-500 focus-visible:ring-green-500"
          />
        </StateCell>
      </ComponentBlock>

      {/* ── SearchInput ────────────────────────────── */}
      <ComponentBlock name="SearchInput" note="'with value' state needs client interaction — see Molecules section">
        <StateCell label="Idle" status="prop">
          <SearchInput placeholder="Search…" className="w-52" />
        </StateCell>
        <StateCell label="With value" status="prop">
          {/* static value to show clear button without React state */}
          <SearchInput value="react hooks" className="w-52" />
        </StateCell>
        <StateCell label="Disabled" status="prop">
          <SearchInput placeholder="Disabled…" className="w-52" disabled />
        </StateCell>
      </ComponentBlock>

      {/* ── Badge ──────────────────────────────────── */}
      <ComponentBlock name="Badge" note="presentational — variants are the only dimension">
        <StateCell label="Default" status="prop"><Badge>Default</Badge></StateCell>
        <StateCell label="Secondary" status="prop"><Badge variant="secondary">Secondary</Badge></StateCell>
        <StateCell label="Outline" status="prop"><Badge variant="outline">Outline</Badge></StateCell>
        <StateCell label="Success" status="prop"><Badge variant="success">Active</Badge></StateCell>
        <StateCell label="Destructive" status="prop"><Badge variant="destructive">Error</Badge></StateCell>
      </ComponentBlock>

      {/* ── Avatar ─────────────────────────────────── */}
      <ComponentBlock name="Avatar" note="presentational — sizes + image fallback are the key states">
        <StateCell label="sm" status="prop"><Avatar size="sm" initials="AB" alt="Alice Brown" /></StateCell>
        <StateCell label="md" status="prop"><Avatar size="md" initials="CD" alt="Charlie Davis" /></StateCell>
        <StateCell label="lg" status="prop"><Avatar size="lg" initials="EF" alt="Emma Ford" /></StateCell>
        <StateCell label="xl" status="prop"><Avatar size="xl" initials="GH" alt="George Harris" /></StateCell>
        <StateCell label="With image" status="prop">
          <Avatar size="md" src="https://github.com/shadcn.png" alt="shadcn" initials="SC" />
        </StateCell>
        <StateCell label="Img error → fallback" status="prop">
          <Avatar size="md" src="/broken.png" alt="Fallback" initials="FB" />
        </StateCell>
      </ComponentBlock>

      {/* ── Alert ──────────────────────────────────── */}
      <ComponentBlock name="Alert">
        <StateCell label="Info" status="prop">
          <Alert variant="info" className="w-60">
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Trial ends in 3 days.</AlertDescription>
          </Alert>
        </StateCell>
        <StateCell label="Success" status="prop">
          <Alert variant="success" className="w-60">
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>Changes were applied.</AlertDescription>
          </Alert>
        </StateCell>
        <StateCell label="Warning" status="prop">
          <Alert variant="warning" className="w-60">
            <AlertTitle>Action required</AlertTitle>
            <AlertDescription>Verify your email.</AlertDescription>
          </Alert>
        </StateCell>
        <StateCell label="Destructive" status="prop">
          <Alert variant="destructive" className="w-60">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Could not save changes.</AlertDescription>
          </Alert>
        </StateCell>
      </ComponentBlock>

      {/* ── StatCard ───────────────────────────────── */}
      <ComponentBlock name="StatCard">
        <StateCell label="Trend up" status="prop">
          <StatCard
            title="Revenue"
            value="$48k"
            trend={{ value: 12.5, label: 'vs last mo.' }}
            icon={<BarChart3 className="h-5 w-5" />}
            className="w-44"
          />
        </StateCell>
        <StateCell label="Trend down" status="prop">
          <StatCard
            title="Churn"
            value="2.3%"
            trend={{ value: -1.2, label: 'vs last mo.' }}
            icon={<Users className="h-5 w-5" />}
            className="w-44"
          />
        </StateCell>
        <StateCell label="Flat" status="prop">
          <StatCard title="Messages" value="0" trend={{ value: 0 }} className="w-44" />
        </StateCell>
        <StateCell label="Loading" status="composed">
          <div className="w-44 rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-7 w-14" />
              </div>
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
            <Skeleton className="h-3 w-24" />
          </div>
        </StateCell>
        <StateCell label="Error" status="composed">
          <div className="w-44 rounded-lg border border-destructive/30 bg-card p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Revenue</p>
                <p className="text-sm font-semibold text-destructive">Failed to load</p>
              </div>
              <FileWarning className="h-5 w-5 text-destructive/70" />
            </div>
            <p className="text-xs text-muted-foreground">Retry or check your connection.</p>
          </div>
        </StateCell>
      </ComponentBlock>

      {/* ── Card ───────────────────────────────────── */}
      <ComponentBlock name="Card">
        <StateCell label="Default" status="prop">
          <Card className="w-52">
            <CardHeader>
              <CardTitle className="text-base">Card title</CardTitle>
              <CardDescription>Supporting description</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Body content goes here.</p>
            </CardContent>
          </Card>
        </StateCell>
        <StateCell label="Loading" status="composed">
          <Card className="w-52">
            <CardHeader>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3.5 w-40 mt-1" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-3/5" />
            </CardContent>
          </Card>
        </StateCell>
        <StateCell label="Error" status="composed">
          <Card className="w-52 border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <FileWarning className="h-4 w-4" />
                Failed to load
              </CardTitle>
              <CardDescription>Please try again or contact support.</CardDescription>
            </CardHeader>
          </Card>
        </StateCell>
      </ComponentBlock>

      {/* ── PageHeader ─────────────────────────────── */}
      <ComponentBlock name="PageHeader">
        <StateCell label="With actions" status="prop">
          <div className="w-80 rounded-md border bg-muted/20 p-4">
            <PageHeader
              title="Team members"
              description="Manage who has access."
              actions={
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Invite
                </Button>
              }
            />
          </div>
        </StateCell>
        <StateCell label="No actions" status="prop">
          <div className="w-80 rounded-md border bg-muted/20 p-4">
            <PageHeader title="Settings" description="Account preferences." />
          </div>
        </StateCell>
        <StateCell label="Loading" status="composed">
          <div className="w-80 rounded-md border bg-muted/20 p-4 space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-60" />
          </div>
        </StateCell>
      </ComponentBlock>

      {/* ── EmptyState ─────────────────────────────── */}
      <ComponentBlock name="EmptyState">
        <StateCell label="No data + CTA" status="prop">
          <div className="w-64 rounded-md border bg-muted/20">
            <EmptyState
              icon={<Inbox className="h-7 w-7" />}
              title="No messages"
              description="Messages will appear here once received."
              action={<Button size="sm"><Plus className="mr-2 h-4 w-4" />New message</Button>}
            />
          </div>
        </StateCell>
        <StateCell label="No data, no CTA" status="prop">
          <div className="w-64 rounded-md border bg-muted/20">
            <EmptyState icon={<Inbox className="h-7 w-7" />} title="Nothing here" />
          </div>
        </StateCell>
        <StateCell label="Error" status="composed">
          <div className="w-64 rounded-md border border-destructive/30 bg-muted/20">
            <EmptyState
              icon={<FileWarning className="h-7 w-7 text-destructive" />}
              title="Failed to load"
              description="Something went wrong fetching your data."
              action={<Button size="sm" variant="outline">Try again</Button>}
            />
          </div>
        </StateCell>
      </ComponentBlock>

      {/* ── Spinner ────────────────────────────────── */}
      <ComponentBlock name="Spinner" note="presentational — compose to represent any loading context">
        <StateCell label="sm" status="prop"><Spinner size="sm" /></StateCell>
        <StateCell label="md" status="prop"><Spinner size="md" /></StateCell>
        <StateCell label="lg" status="prop"><Spinner size="lg" /></StateCell>
        <StateCell label="In button" status="composed">
          <Button variant="outline" disabled>
            <Spinner size="sm" className="mr-2" />
            Processing…
          </Button>
        </StateCell>
        <StateCell label="Full-page overlay" status="composed">
          <div className="flex h-20 w-32 items-center justify-center rounded-md border bg-muted/30">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        </StateCell>
      </ComponentBlock>

      {/* ── Skeleton ───────────────────────────────── */}
      <ComponentBlock name="Skeleton" note="presentational — compose to mirror the shape of loading content">
        <StateCell label="Text lines" status="composed">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-40" />
          </div>
        </StateCell>
        <StateCell label="Avatar" status="composed">
          <Skeleton className="h-10 w-10 rounded-full" />
        </StateCell>
        <StateCell label="List row" status="composed">
          <div className="flex w-52 items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </StateCell>
        <StateCell label="Card" status="composed">
          <div className="w-48 space-y-3 rounded-lg border p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-20 w-full rounded-md" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        </StateCell>
      </ComponentBlock>

    </div>
  );
}
