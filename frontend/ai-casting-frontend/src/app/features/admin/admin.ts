import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  AdminService, AgencyRequest, AgencyStats, Bucket, Delta, ImportPreview, ImportResult, ImportRow, PlatformStats, ProjectStats, UserRow, AuditEntry } from '../../core/services/admin.service';
import { SelectFieldComponent } from '../../shared/components/select-field/select-field';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';
import { AreaSparkComponent, ColumnSeries, HBar, HBarsComponent, StackedColumnsComponent, monthLabel } from '../../shared/components/charts/charts';
import { EMAIL_RE } from '../../shared/forms/rules';
import { frDate, todayIso } from '../../shared/forms/dates';

type Tab = 'tableau' | 'agences' | 'projets' | 'acteurs' | 'equipe' | 'import' | 'journal';
type RowFilter = 'tous' | 'OK' | 'ERREUR' | 'DOUBLON' | 'remarques';
interface Kpi { label: string; value: number; sub: string; delta: Delta | null; ratio?: number; }

const STATUS_LABELS: Record<string, string> = {
  PRESELECTIONNE: 'Présélectionnés', AUDITION: 'En audition', RAPPEL: 'Rappelés', CHOISI: 'Choisis', REFUSE: 'Refusés',
  EN_COURS: 'En cours', TERMINE: 'Terminés', ARCHIVE: 'Archivés',
  AGENCE: 'Saisis par l’agence', INSCRIPTION: 'Inscrits eux-mêmes', IMPORT: 'Importés'
};

/** Tableau de bord de la plateforme : agences sous contrat, projets, acteurs et freelancers, comptes, import. */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, RouterLink, SelectFieldComponent, DateFieldComponent, StackedColumnsComponent, AreaSparkComponent, HBarsComponent],
  templateUrl: './admin.html',
  styleUrl: './admin.scss'
})
export class AdminComponent implements OnInit {
  private readonly admin = inject(AdminService);

  readonly tab = signal<Tab>('tableau');
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'tableau', label: 'Tableau de bord' }, { id: 'agences', label: 'Agences' }, { id: 'projets', label: 'Projets' },
    { id: 'acteurs', label: 'Acteurs et freelancers' }, { id: 'equipe', label: 'Équipe et comptes' }, { id: 'import', label: "Import d'acteurs" },
    { id: 'journal', label: 'Journal' }
  ];

  // ═════════ Journal d'audit (T-099) ═════════
  readonly auditEntries = signal<AuditEntry[]>([]);
  readonly auditLoaded = signal(false);
  readonly auditFilter = signal('');
  readonly auditOptions = [
    { value: '', label: 'Toutes les actions' }, { value: 'COMPTE_CREE', label: 'Comptes créés' }, { value: 'COMPTE_MODIFIE', label: 'Comptes modifiés' },
    { value: 'AGENCE_CREEE', label: 'Agences ajoutées' }, { value: 'CONTRAT_MODIFIE', label: 'Contrats modifiés' }, { value: 'IMPORT', label: 'Imports' }
  ];
  readonly auditLabel: Record<string, string> = {
    COMPTE_CREE: 'Compte créé', COMPTE_MODIFIE: 'Compte modifié', AGENCE_CREEE: 'Agence ajoutée', CONTRAT_MODIFIE: 'Contrat modifié', IMPORT: 'Import d’acteurs'
  };
  private readonly auditFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  auditWhen(ms: number): string { return this.auditFmt.format(new Date(ms)); }
  loadAudit(action = this.auditFilter()): void {
    this.auditFilter.set(action);
    this.admin.audit(action || undefined).subscribe({
      next: e => { this.auditEntries.set(e); this.auditLoaded.set(true); },
      error: () => this.auditLoaded.set(true)
    });
  }
  readonly frDate = frDate;
  label = (k: string) => STATUS_LABELS[k] ?? k;

  // ═════════ Tableau de bord ═════════
  readonly stats = signal<PlatformStats | null>(null);
  readonly statsError = signal('');
  readonly months = signal(12);
  readonly monthOptions = [{ value: 6, label: '6 derniers mois' }, { value: 12, label: '12 derniers mois' }, { value: 24, label: '24 derniers mois' }];
  readonly asTable = signal(false);

  readonly monthLabels = computed(() => this.stats()?.monthly.map(m => m.month) ?? []);
  readonly actorSeries = computed<ColumnSeries[]>(() => {
    const m = this.stats()?.monthly ?? [];
    return [
      { name: 'Saisis par l’agence', color: 'var(--series-1)', values: m.map(x => x.actorsAgence) },
      { name: 'Inscrits eux-mêmes', color: 'var(--series-2)', values: m.map(x => x.actorsInscription) },
      { name: 'Importés', color: 'var(--series-3)', values: m.map(x => x.actorsImport) }
    ];
  });
  readonly sparks = computed(() => {
    const m = this.stats()?.monthly ?? [];
    return [
      { title: 'Projets créés', values: m.map(x => x.projects) },
      { title: 'Recherches IA', values: m.map(x => x.searches) },
      { title: 'Ajouts en shortlist', values: m.map(x => x.shortlisted) }
    ];
  });
  readonly kpis = computed<Kpi[]>(() => {
    const k = this.stats()?.kpis;
    if (!k) return [];
    return [
      { label: 'Agences sous contrat', value: k.agenciesActive, sub: `${k.agenciesTotal} au total`, delta: null },
      { label: 'Agents de casting', value: k.agents, sub: 'comptes actifs ou non', delta: null },
      { label: 'Acteurs dans le vivier', value: k.actors, sub: `${k.freelancers} freelancers inscrits`, delta: k.newActors30 },
      { label: 'Projets en cours', value: k.projectsActive, sub: `${k.projectsTotal} au total`, delta: k.newProjects30 },
      { label: 'Rôles pourvus', value: k.rolesFilled, sub: `sur ${k.roles} rôles`, delta: null, ratio: k.roles ? k.rolesFilled / k.roles : 0 },
      { label: 'Recherches IA', value: k.searches30.current, sub: '30 derniers jours', delta: k.searches30 }
    ];
  });
  readonly pipelineBars = computed<HBar[]>(() => (this.stats()?.pipeline ?? []).map(b => ({ label: this.label(b.label), value: b.count })));

  deltaText(d: Delta): { text: string; dir: 'up' | 'down' | 'flat' } {
    const diff = d.current - d.previous;
    if (diff === 0) return { text: 'stable sur 30 jours', dir: 'flat' };
    if (d.previous === 0) return { text: `+${d.current} sur 30 jours`, dir: 'up' };
    const pct = Math.round((diff / d.previous) * 100);
    return { text: `${pct > 0 ? '+' : ''}${pct} % sur 30 jours`, dir: diff > 0 ? 'up' : 'down' };
  }

  loadStats(): void {
    this.statsError.set('');
    this.admin.stats(this.months()).subscribe({
      next: s => this.stats.set(s),
      error: () => this.statsError.set('Statistiques indisponibles pour le moment.')
    });
  }
  setMonths(m: number): void { this.months.set(m); this.stats.set(null); this.loadStats(); }
  monthLong(ym: string): string { const [y] = ym.split('-'); return monthLabel(ym).replace('.', '') + ' ' + y; }

  // ═════════ Acteurs et freelancers ═════════
  bars(list: Bucket[] | undefined, translate = false): HBar[] {
    return (list ?? []).map(b => ({ label: translate ? this.label(b.label) : b.label, value: b.count }));
  }
  pct(part: number, total: number): number { return total ? Math.round((part / total) * 100) : 0; }

  // ═════════ Agences ═════════
  readonly agencies = signal<AgencyStats[]>([]);
  readonly agenciesLoaded = signal(false);
  readonly agencyForm = signal<'new' | string | null>(null);
  agency: AgencyRequest = this.emptyAgency();
  readonly agencyTried = signal(false);
  readonly agencyError = signal('');
  readonly agencyBusy = signal(false);
  readonly agencyOptions = computed(() => this.agencies().map(a => ({ value: a.id, label: a.name + (a.status === 'EXPIRE' ? ' (contrat échu)' : '') })));

  // T-098 · offre commerciale
  readonly planOptions = [
    { value: '', label: 'Non défini' }, { value: 'ESSENTIEL', label: 'Essentiel' }, { value: 'PRO', label: 'Pro' },
    { value: 'STUDIO', label: 'Studio' }, { value: 'SUR_MESURE', label: 'Sur mesure' }
  ];
  readonly currencyOptions = [{ value: 'TND', label: 'TND' }, { value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }];
  planLabel(p: string | null): string { return this.planOptions.find(o => o.value === (p ?? ''))?.label ?? ''; }
  money(amount: number | null, currency: string): string {
    if (amount == null) return '';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  }

  private emptyAgency(): AgencyRequest {
    return { name: '', city: null, contactEmail: null, contractStart: todayIso(), contractEnd: null, maxAgents: null, notes: null, plan: '', monthlyAmount: null, currency: 'TND' };
  }
  statusLabel(s: string): string { return s === 'ACTIF' ? 'Sous contrat' : s === 'A_VENIR' ? 'Contrat à venir' : 'Contrat échu'; }
  daysLeft(a: AgencyStats): string {
    if (!a.contractEnd) return 'sans date de fin';
    const d = Math.round((Date.parse(a.contractEnd) - Date.parse(todayIso())) / 86400000);
    if (d < 0) return `échu depuis ${-d} j`;
    if (d === 0) return 'se termine aujourd’hui';
    return d <= 60 ? `se termine dans ${d} j` : `jusqu’au ${frDate(a.contractEnd)}`;
  }
  loadAgencies(): void {
    this.admin.agencies().subscribe({ next: a => { this.agencies.set(a); this.agenciesLoaded.set(true); }, error: () => this.agenciesLoaded.set(true) });
  }
  openAgency(a: AgencyStats | null): void {
    this.agencyTried.set(false);
    this.agencyError.set('');
    this.agency = a
      ? { name: a.name, city: a.city, contactEmail: a.contactEmail, contractStart: a.contractStart, contractEnd: a.contractEnd, maxAgents: a.maxAgents, notes: null,
          plan: a.plan ?? '', monthlyAmount: a.monthlyAmount, currency: a.currency || 'TND' }
      : this.emptyAgency();
    this.agencyForm.set(a ? a.id : 'new');
  }
  agencyFieldError(f: 'name' | 'contactEmail' | 'contractStart' | 'maxAgents' | 'monthlyAmount'): string {
    if (!this.agencyTried()) return '';
    const a = this.agency;
    if (f === 'name' && !a.name.trim()) return 'Donnez le nom de l’agence.';
    if (f === 'contactEmail' && a.contactEmail && !EMAIL_RE.test(a.contactEmail.trim())) return 'Adresse e-mail incomplète.';
    if (f === 'contractStart' && !a.contractStart) return 'Date de début obligatoire.';
    if (f === 'monthlyAmount' && a.monthlyAmount != null && (a.monthlyAmount as any) !== '' && (isNaN(+a.monthlyAmount) || +a.monthlyAmount < 0 || +a.monthlyAmount > 1_000_000)) return 'Montant entre 0 et 1 000 000.';
    if (f === 'maxAgents' && a.maxAgents != null && (a.maxAgents as any) !== '' && (!Number.isInteger(+a.maxAgents) || +a.maxAgents < 1 || +a.maxAgents > 1000)) return 'Entre 1 et 1000.';
    return '';
  }
  saveAgency(): void {
    this.agencyTried.set(true);
    if (['name', 'contactEmail', 'contractStart', 'maxAgents', 'monthlyAmount'].some(f => this.agencyFieldError(f as any))) return;
    if (this.agency.contractEnd && this.agency.contractEnd < this.agency.contractStart) return;
    const body: AgencyRequest = {
      ...this.agency, name: this.agency.name.trim(), city: this.agency.city?.trim() || null,
      contactEmail: this.agency.contactEmail?.trim() || null, contractEnd: this.agency.contractEnd || null,
      maxAgents: this.agency.maxAgents == null || (this.agency.maxAgents as any) === '' ? null : +this.agency.maxAgents,
      plan: this.agency.plan || null,
      monthlyAmount: this.agency.monthlyAmount == null || (this.agency.monthlyAmount as any) === '' ? null : +this.agency.monthlyAmount
    };
    const id = this.agencyForm();
    this.agencyBusy.set(true);
    (id === 'new' ? this.admin.createAgency(body) : this.admin.updateAgency(id!, body)).subscribe({
      next: () => { this.agencyBusy.set(false); this.agencyForm.set(null); this.loadAgencies(); this.loadStats(); },
      error: (e: HttpErrorResponse) => { this.agencyBusy.set(false); this.agencyError.set(e.error?.message ?? 'Enregistrement impossible.'); }
    });
  }

  // ═════════ Projets ═════════
  readonly projects = signal<ProjectStats[]>([]);
  readonly projectsLoaded = signal(false);
  readonly projectFilter = signal('');
  readonly projectFilters = [{ value: '', label: 'Tous' }, { value: 'EN_COURS', label: 'En cours' }, { value: 'TERMINE', label: 'Terminés' }, { value: 'ARCHIVE', label: 'Archivés' }];
  typeLabel(t: string): string {
    return ({ LONG_METRAGE: 'Long métrage', COURT_METRAGE: 'Court métrage', SERIE: 'Série', PUBLICITE: 'Publicité', CLIP: 'Clip', THEATRE: 'Théâtre', AUTRE: 'Autre' } as Record<string, string>)[t] ?? t;
  }
  loadProjects(): void {
    this.projectsLoaded.set(false);
    this.admin.projects(this.projectFilter() || undefined).subscribe({
      next: p => { this.projects.set(p); this.projectsLoaded.set(true); }, error: () => this.projectsLoaded.set(true)
    });
  }
  setProjectFilter(v: string): void { this.projectFilter.set(v); this.loadProjects(); }
  ago(iso: string | null): string {
    if (!iso) return '—';
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
    return days <= 0 ? 'aujourd’hui' : days === 1 ? 'hier' : days < 30 ? `il y a ${days} j` : new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // ═════════ Équipe ═════════
  readonly users = signal<UserRow[]>([]);
  readonly usersLoading = signal(true);
  readonly roleFilter = signal<string>('');
  readonly search = signal('');
  readonly confirming = signal<string | null>(null);
  readonly userError = signal('');
  readonly roleOptions = [{ value: 'AGENT', label: 'Agent' }, { value: 'ADMIN', label: 'Administrateur' }];
  readonly filters = [
    { value: '', label: 'Tous' }, { value: 'AGENT', label: 'Agents' }, { value: 'ADMIN', label: 'Administrateurs' }, { value: 'ACTEUR', label: 'Acteurs' }
  ];
  readonly shownUsers = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.users().filter(u => (!this.roleFilter() || u.role === this.roleFilter())
      && (!q || `${u.firstName} ${u.lastName} ${u.email} ${u.agencyName ?? ''}`.toLowerCase().includes(q)));
  });

  creating = false;
  newAgent = { firstName: '', lastName: '', email: '', role: 'AGENT', agencyId: '' };
  readonly createTried = signal(false);
  readonly createError = signal('');
  readonly createBusy = signal(false);
  readonly created = signal<{ user: UserRow; password: string | null } | null>(null);
  readonly copied = signal(false);

  // ═════════ Import ═════════
  readonly dragOver = signal(false);
  readonly previewing = signal(false);
  readonly preview = signal<ImportPreview | null>(null);
  readonly importError = signal('');
  readonly rowFilter = signal<RowFilter>('tous');
  readonly selected = signal<Set<number>>(new Set());
  readonly importing = signal(false);
  readonly result = signal<ImportResult | null>(null);
  readonly shownRows = computed(() => {
    const p = this.preview();
    if (!p) return [];
    const f = this.rowFilter();
    return p.rows.filter(r => f === 'tous' ? true : f === 'remarques' ? r.warnings.length > 0 : r.status === f);
  });
  readonly selectedCount = computed(() => this.selected().size);

  ngOnInit(): void {
    this.loadStats();
    this.loadAgencies();
    this.loadProjects();
    this.loadUsers();
  }

  roleLabel(r: string): string { return ({ ADMIN: 'Administrateur', AGENT: 'Agent', ACTEUR: 'Acteur' } as Record<string, string>)[r] ?? r; }
  providerLabel(p: string): string { return ({ GOOGLE: 'Google', FACEBOOK: 'Facebook' } as Record<string, string>)[p] ?? ''; }
  since(iso: string): string { return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }

  loadUsers(): void {
    this.usersLoading.set(true);
    this.admin.users().subscribe({
      next: u => { this.users.set(u); this.usersLoading.set(false); },
      error: () => { this.usersLoading.set(false); this.userError.set('Impossible de charger les comptes.'); }
    });
  }

  agentError(field: 'firstName' | 'lastName' | 'email' | 'agencyId'): string {
    if (!this.createTried()) return '';
    if (field === 'agencyId') return this.newAgent.role === 'AGENT' && !this.newAgent.agencyId ? 'Choisissez l’agence cliente de cet agent.' : '';
    const v = this.newAgent[field].trim();
    if (!v) return 'Champ obligatoire.';
    if (field === 'email' && !EMAIL_RE.test(v)) return 'Adresse e-mail incomplète (ex. nom@agence.fr).';
    if (field !== 'email' && /[\d<>@#]/.test(v)) return 'Pas de chiffres ni de symboles.';
    return '';
  }

  openCreate(): void {
    this.creating = true;
    this.created.set(null);
    this.createTried.set(false);
    this.createError.set('');
    this.newAgent = { firstName: '', lastName: '', email: '', role: 'AGENT', agencyId: this.agencies().find(a => a.status === 'ACTIF')?.id ?? '' };
  }

  submitAgent(): void {
    this.createTried.set(true);
    if (['firstName', 'lastName', 'email', 'agencyId'].some(f => this.agentError(f as any))) return;
    this.createBusy.set(true);
    this.createError.set('');
    const a = this.newAgent;
    this.admin.createAgent({
      firstName: a.firstName.trim(), lastName: a.lastName.trim(), email: a.email.trim(), role: a.role,
      agencyId: a.role === 'AGENT' ? a.agencyId : null
    }).subscribe({
      next: r => {
        this.createBusy.set(false);
        this.creating = false;
        this.created.set({ user: r.user, password: r.temporaryPassword });
        this.users.update(list => [r.user, ...list]);
        this.loadAgencies();
        this.loadStats();
      },
      error: (e: HttpErrorResponse) => { this.createBusy.set(false); this.createError.set(e.error?.message ?? 'Création impossible.'); }
    });
  }

  copyPassword(): void {
    const p = this.created()?.password;
    if (!p) return;
    navigator.clipboard?.writeText(p).then(() => { this.copied.set(true); setTimeout(() => this.copied.set(false), 2000); }).catch(() => {});
  }

  setEnabled(u: UserRow, enabled: boolean): void {
    this.confirming.set(null);
    this.userError.set('');
    this.admin.updateUser(u.id, { enabled }).subscribe({
      next: x => this.users.update(list => list.map(y => (y.id === x.id ? x : y))),
      error: (e: HttpErrorResponse) => this.userError.set(e.error?.message ?? 'Modification impossible.')
    });
  }

  setRole(u: UserRow, role: string): void {
    if (role === u.role) return;
    this.userError.set('');
    this.admin.updateUser(u.id, { role }).subscribe({
      next: x => { this.users.update(list => list.map(y => (y.id === x.id ? x : y))); this.loadStats(); },
      error: (e: HttpErrorResponse) => { this.userError.set(e.error?.message ?? 'Modification impossible.'); this.loadUsers(); }
    });
  }

  setAgency(u: UserRow, agencyId: string): void {
    if (agencyId === u.agencyId) return;
    this.userError.set('');
    this.admin.updateUser(u.id, { agencyId }).subscribe({
      next: x => { this.users.update(list => list.map(y => (y.id === x.id ? x : y))); this.loadAgencies(); },
      error: (e: HttpErrorResponse) => { this.userError.set(e.error?.message ?? 'Modification impossible.'); this.loadUsers(); }
    });
  }

  // ── Import ──
  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.analyse(f);
    input.value = '';
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    const f = ev.dataTransfer?.files?.[0];
    if (f) this.analyse(f);
  }

  private analyse(file: File): void {
    const name = file.name.toLowerCase();
    if (!/\.(xlsx|xlsm|csv|txt)$/.test(name)) { this.importError.set('Format non pris en charge : fichier Excel (.xlsx) ou CSV attendu.'); return; }
    if (file.size > 10 * 1024 * 1024) { this.importError.set('Fichier trop lourd : 10 Mo au plus.'); return; }
    this.importError.set('');
    this.result.set(null);
    this.preview.set(null);
    this.previewing.set(true);
    this.admin.preview(file).subscribe({
      next: p => {
        this.previewing.set(false);
        this.preview.set(p);
        this.rowFilter.set('tous');
        this.selected.set(new Set(p.rows.map((r, i) => (r.status === 'OK' ? i : -1)).filter(i => i >= 0)));
      },
      error: (e: HttpErrorResponse) => { this.previewing.set(false); this.importError.set(e.error?.message ?? 'Lecture du fichier impossible.'); }
    });
  }

  indexOf(r: ImportRow): number { return this.preview()!.rows.indexOf(r); }

  toggle(r: ImportRow): void {
    if (r.status !== 'OK') return;
    const i = this.indexOf(r);
    this.selected.update(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  toggleAll(on: boolean): void {
    const p = this.preview();
    if (!p) return;
    this.selected.set(on ? new Set(p.rows.map((r, i) => (r.status === 'OK' ? i : -1)).filter(i => i >= 0)) : new Set());
  }

  runImport(): void {
    const p = this.preview();
    if (!p || !this.selectedCount() || this.importing()) return;
    const rows = [...this.selected()].sort((a, b) => a - b).map(i => p.rows[i].data);
    this.importing.set(true);
    this.importError.set('');
    this.admin.importRows(rows).subscribe({
      next: r => { this.importing.set(false); this.result.set(r); this.preview.set(null); this.loadStats(); },
      error: (e: HttpErrorResponse) => { this.importing.set(false); this.importError.set(e.error?.message ?? "L'import a échoué. Rien n'a été enregistré."); }
    });
  }

  reset(): void { this.preview.set(null); this.result.set(null); this.importError.set(''); }

  name(r: ImportRow): string { return [r.data.firstName, r.data.lastName].filter(Boolean).join(' ') || '—'; }
  langs(r: ImportRow): string { return (r.data.languages ?? []).map((l: any) => l.name).join(', '); }
}
