import { Activity, ArrowLeft, Gauge, ShieldAlert, Timer, TrendingUp, Undo2, Wrench, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import AiBadge from '@/components/AiBadge';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import StatCard from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMetrics } from '@/hooks/useStats';
import { pct, titleCase } from '@/lib/utils';

const ms = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);

function ChartCard({ title, description, children, empty }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-64">{empty ? <EmptyState title="No data yet" description="Metrics appear after the first AI calls." /> : children}</CardContent>
    </Card>
  );
}

export default function ObservabilityPage() {
  const { data: m, isLoading, error, refetch } = useMetrics();

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to="/hr"><ArrowLeft className="mr-1 h-4 w-4" /> Dashboard</Link></Button>
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  const trend = (m?.dailyTrend ?? []).map((d) => ({ date: d.date.slice(5), Confidence: d.avgConfidence == null ? null : Math.round(d.avgConfidence * 100), Success: d.success, Failed: d.failed }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2"><Link to="/hr"><ArrowLeft className="mr-1 h-4 w-4" /> Dashboard</Link></Button>
          <h1 className="text-2xl font-semibold tracking-tight">AI observability</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Computed from recorded LLM calls, plans, tasks and audit data <AiBadge />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Avg AI latency" value={ms(m?.avgLatencyMs)} icon={Timer} loading={isLoading} hint={`${m?.totalLlmCalls ?? 0} LLM calls`} />
        <StatCard label="p95 latency" value={ms(m?.p95LatencyMs)} icon={Gauge} loading={isLoading} />
        <StatCard label="AI success rate" value={pct(m?.aiSuccessRate)} icon={Activity} loading={isLoading} tone={m?.aiSuccessRate != null && m.aiSuccessRate < 0.9 ? 'text-amber-600' : undefined} hint="Valid output after guardrails" />
        <StatCard label="Fallback plans" value={m?.fallbackCount ?? 0} icon={Undo2} loading={isLoading} hint="Rules-only plans" />
        <StatCard label="Avg confidence" value={pct(m?.avgConfidence)} icon={TrendingUp} loading={isLoading} />
        <StatCard label="AI tasks edited by HR" value={pct(m?.aiTasksModifiedPct)} icon={Wrench} loading={isLoading} hint={`of ${m?.aiTasksTotal ?? 0} AI tasks`} />
        <StatCard label="Avg onboarding time" value={m?.avgOnboardingDays == null ? '—' : `${m.avgOnboardingDays.toFixed(1)} d`} icon={Timer} loading={isLoading} />
        <StatCard label="Prompt injections" value={m?.promptInjectionCount ?? 0} icon={ShieldAlert} loading={isLoading} tone={m?.promptInjectionCount ? 'text-red-600' : undefined} hint={`${m?.unansweredChatCount ?? 0} unanswered chats`} />
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Latency distribution" description="Number of LLM calls per latency bucket" empty={!m.totalLlmCalls}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.latencyHistogram}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <ChartTooltip />
                <Bar dataKey="count" name="Calls" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Success vs failed calls" description="Last 14 days" empty={!trend.length}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="Success" stackId="a" fill="#10b981" />
                <Bar dataKey="Failed" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Confidence trend" description="Average model confidence per day (%)" empty={!trend.length}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <ChartTooltip />
                <Line type="monotone" dataKey="Confidence" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><XCircle className="h-4 w-4" /> Top escalation reasons</CardTitle>
              <CardDescription>All time</CardDescription>
            </CardHeader>
            <CardContent>
              {m.topEscalationReasons.length === 0 ? (
                <EmptyState title="No escalations yet" />
              ) : (
                <ul className="space-y-2">
                  {m.topEscalationReasons.map((r) => {
                    const max = m.topEscalationReasons[0].count;
                    return (
                      <li key={r.type}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span>{titleCase(r.type)}</span>
                          <span className="font-medium tabular-nums">{r.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-orange-400" style={{ width: `${(r.count / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
