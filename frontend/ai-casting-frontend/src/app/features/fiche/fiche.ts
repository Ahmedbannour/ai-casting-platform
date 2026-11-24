import { AfterViewChecked, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { LiveService } from '../../core/services/live.service';
import { PageRailComponent } from '../../shared/components/page-rail/page-rail';
import { DropzoneComponent } from '../../shared/components/dropzone/dropzone';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';
import { CalMark, CalendarComponent } from '../../shared/components/calendar/calendar';
import { addDays, todayIso } from '../../shared/forms/dates';
import { concat, last } from 'rxjs';
import { FicheService, RoleInput, Sheet, SheetField, SheetRole, SheetSource, SheetStage } from './fiche.service';
import { AGE_RANGES, AIDES, Aide, ROLE_INTENTIONS, ROLE_TYPES, addLine, dayFr, daysBetween, derived, hasIn, isoRange, parseRange, toggleIn } from './fiche-aides';

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * P-083 · La fiche unique du projet, lue comme un article : l'état des lieux en tête, puis les sept étapes
 * qui apparaissent au défilement. Chacun modifie ses étapes ; un document déposé est lu par l'IA,
 * qui remplit les étapes de l'auteur et prépare des propositions pour les autres.
 */
@Component({
  selector: 'app-fiche',
  standalone: true,
  imports: [FormsModule, RouterLink, PageRailComponent, DropzoneComponent, DateFieldComponent, CalendarComponent],
  template: `
  <div class="sheet">
  <article class="doc" #doc aria-label="Fiche du projet">
    @if (error() && !sheet()) { <p class="err" role="alert">{{ error() }}</p> }
    @if (!sheet() && !error()) { <div class="skel hero-sk" aria-hidden="true"></div><div class="skel" aria-hidden="true"></div> }
    @if (sheet(); as s) {
      <!-- État des lieux -->
      <header class="hero reveal" data-rail data-rail-label="État des lieux" id="etat-des-lieux">
        <p class="kicker">Dossier du film{{ s.brandName ? ' · ' + s.brandName : '' }}</p>
        <h2 class="h-title">{{ s.title }}</h2>
        <div class="state">
          <div class="pct" aria-label="Fiche remplie à {{ s.progress }} %"><b>{{ shown() }}</b><span>%</span></div>
          <div class="state-txt">
            <p class="lead">{{ s.stagesDone }} chapitre{{ s.stagesDone > 1 ? 's' : '' }} complet{{ s.stagesDone > 1 ? 's' : '' }} sur {{ s.stagesTotal }}.
              Phase en cours : <a href="#phase" (click)="jump($event, 'phase')">{{ s.gate.title }}</a>{{ s.gate.canAct ? ', c’est à vous.' : (s.gate.who ? ', ' + s.gate.who.toLowerCase() + ' a la main.' : '.') }}</p>
            @if (myStages().length) {
              <p class="mine-line">Vos étapes :
                @for (m of myStages(); track m.key) { <a class="chip" [class.todo]="m.state !== 'complete'" [href]="'#etape-' + m.key" (click)="jump($event, m.key)">{{ pad(m.num) }} {{ m.title }}@if (m.suggestions) { <i>{{ m.suggestions }} proposition{{ m.suggestions > 1 ? 's' : '' }}</i> }</a> }
              </p>
            } @else { <p class="mine-line">Vous lisez cette fiche ; chaque étape est remplie par son équipe.</p> }
            <div class="hero-tools">
              @if (nextTodo(); as n) { <button type="button" class="go" (click)="openField(n.st, n.f)">Continuer : {{ n.f.label }}</button> }
              <button type="button" class="ghost" (click)="copyAll()">Copier le résumé</button>
              <button type="button" class="ghost" (click)="print()">Imprimer ou PDF</button>
            </div>
          </div>
        </div>
        <!-- Le déroulé, comme les étapes d'un build -->
        <ol class="pipe" aria-label="Avancement par étape">
          @for (st of s.stages; track st.key; let i = $index) {
            <li [attr.data-s]="st.state" [style.--d]="i">
              <a [href]="'#etape-' + st.key" (click)="jump($event, st.key)" [attr.aria-label]="pad(st.num) + ' ' + st.title + ' : ' + stateLabel(st.state)">
                <span class="seg"><b [style.width.%]="st.total ? st.filled / st.total * 100 : 0"></b></span>
                <span class="n">{{ pad(st.num) }}</span>
              </a>
            </li>
          }
        </ol>
      </header>

      <!-- La phase en cours : qui a la main, ce qu'il manque, et la validation -->
      <section class="gate reveal" data-rail data-rail-label="La phase en cours" id="phase" [attr.data-phase]="s.gate.phase" [class.act]="s.gate.canAct">
        <ol class="phases" aria-label="Les phases du film">
          @for (ph of phases; track ph.key; let i = $index) {
            <li [class.done]="i < s.gate.phaseIndex" [class.now]="i === s.gate.phaseIndex" [attr.aria-current]="i === s.gate.phaseIndex ? 'step' : null"><span class="ph-dot" aria-hidden="true"></span>{{ ph.label }}</li>
          }
        </ol>
        <h2>{{ s.gate.title }}</h2>
        @if (s.gate.who) { <p class="who">{{ s.gate.canAct ? 'C’est à vous' : 'Qui a la main' }} : <b>{{ s.gate.who }}</b></p> }
        <p class="gtext">{{ s.gate.text }}</p>
        @if (s.gate.feedback) { <blockquote class="fb"><b>Retour de la marque</b>{{ cleanFeedback(s.gate.feedback) }}</blockquote> }
        @if (s.gate.action && s.gate.missing.length) {
          <div class="miss"><b>Avant de continuer</b>
            <ul>@for (m of s.gate.missing; track m) { <li>{{ m }}</li> }</ul>
          </div>
        }
        <div class="g-actions">
          @if (s.gate.action && s.gate.canAct) {
            <button type="button" class="go big" [disabled]="busy() || s.gate.missing.length > 0" (click)="step(s.gate.action!)">{{ s.gate.actionLabel }}</button>
          } @else if (s.gate.action) {
            <p class="wait"><span class="pulse" aria-hidden="true"></span>En attente : {{ s.gate.who.toLowerCase() }}.</p>
          }
          @if (s.gate.canAskChanges) { <button type="button" class="ghost" [attr.aria-expanded]="asking()" (click)="asking.set(!asking())">Demander des modifications</button> }
          @if (s.gate.roomId && !roomId()) { <a class="go" [routerLink]="['/rooms', s.gate.roomId]">Ouvrir la room de casting</a> }
        </div>
        @if (asking()) {
          <form class="ask" (ngSubmit)="askChanges()">
            <label for="ask-c">Ce qu'il faut modifier, envoyé à l'agence</label>
            <textarea id="ask-c" name="c" rows="3" maxlength="2000" [(ngModel)]="changes" placeholder="Ex. Montrez la famille au réveil, moins de paysage"></textarea>
            <div class="edit-actions"><button type="submit" class="go" [disabled]="busy() || !changes.trim()">Envoyer à l'agence</button>
              <button type="button" class="ghost" (click)="asking.set(false)">Annuler</button></div>
          </form>
        }
      </section>

      <!-- Déposer un document : l'IA remplit -->
      @if (s.canUpload) {
        <section class="feed reveal" data-rail data-rail-label="Remplir avec l'IA" id="remplir-ia" aria-labelledby="feed-h">
          <h2 id="feed-h">Remplir avec l'IA</h2>
          <p class="muted">Déposez votre brief, votre présentation ou collez un lien Canva : l'IA lit le document, remplit vos étapes et prépare des propositions pour les autres. Chacun n'a plus qu'à vérifier.</p>
          <div class="feed-row">
            <app-dropzone title="Déposer un document" [accept]="formats" [formats]="['PDF', 'Word', 'PowerPoint', 'texte']" [maxMb]="25" [busy]="uploading()" busyText="Envoi…" (file)="upload($event)" />
            <form class="link" (ngSubmit)="sendLink()">
              <label for="fiche-link">Ou un lien (Canva, page web)</label>
              <div class="link-row">
                <input id="fiche-link" name="link" type="url" inputmode="url" [(ngModel)]="linkUrl" placeholder="https://www.canva.com/design/…/view" [attr.aria-describedby]="linkErr() ? 'link-err' : null" />
                <button type="submit" class="go" [disabled]="uploading() || !linkUrl.trim()">Lire</button>
              </div>
              @if (linkErr()) { <p class="field-msg" id="link-err" role="alert">{{ linkErr() }}</p> }
            </form>
          </div>
          @if (s.sources.length) {
            <ul class="sources" aria-label="Documents lus">
              @for (src of s.sources.slice(0, 4); track src.id) {
                <li [attr.data-st]="src.status">
                  <span class="src-ic" aria-hidden="true">{{ src.kind === 'LIEN' ? '↗' : '▤' }}</span>
                  <div class="src-txt">
                    <b>{{ src.name }}</b>
                    <span>@switch (src.status) {
                      @case ('LECTURE') { L'IA lit le document<i class="dots" aria-hidden="true"><i></i><i></i><i></i></i> }
                      @case ('FAIT') { {{ resultLine(src) }} }
                      @default { Lecture impossible }
                    } · {{ src.addedBy }}, {{ ago(src.createdAt) }}</span>
                    @if (src.message) { <small>{{ src.message }}</small> }
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      }

      @if (msg()) { <p class="ok" role="status">{{ msg() }}</p> }
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      <!-- Les étapes -->
      <div class="stages">
        @for (st of s.stages; track st.key) {
          <section class="stage reveal" [id]="'etape-' + st.key" data-rail [attr.data-rail-state]="isPrimary(st) && st.state !== 'complete' && current(st) ? 'tour' : st.state"
                   [attr.data-rail-label]="st.title" [class.mine]="isPrimary(st) && current(st)" [attr.data-s]="st.state" [attr.aria-labelledby]="'h-' + st.key">
            <div class="st-head">
              <span class="num" aria-hidden="true">{{ pad(st.num) }}</span>
              <div class="st-ttl">
                <h2 [id]="'h-' + st.key">{{ st.title }}</h2>
                <p class="by">
                  <span class="owner">{{ isPrimary(st) ? 'Votre chapitre' : st.canEdit ? 'Rédigé par ' + by(st.owner) + ' · vous pouvez compléter' : 'Rédigé par ' + by(st.owner) }}</span>
                  <span class="badge" [attr.data-s]="st.state">{{ stateLabel(st.state) }}{{ st.total && st.state !== 'complete' ? ' · ' + st.filled + '/' + st.total : '' }}</span>
                  @if (st.updatedBy) { <span class="when">{{ st.updatedBy }}, {{ ago(st.updatedAt!) }}</span> }
                </p>
              </div>
            </div>
            <p class="intro">{{ st.intro }}</p>
            @if (st.fields.length) {
              <div class="st-tools" role="group" [attr.aria-label]="'Outils du chapitre ' + st.title">
                @if (st.canEdit && firstEmpty(st); as fe) { <button type="button" class="tool" (click)="openField(st, fe)">Remplir le prochain champ vide</button> }
                @if (pendingSugg(st).length > 1) { <button type="button" class="tool strong" [disabled]="busy()" (click)="acceptAll(st)">Accepter les {{ pendingSugg(st).length }} propositions de l’IA</button> }
                @if (st.filled) { <button type="button" class="tool" (click)="copyStage(st)">Copier le chapitre</button> }
              </div>
            }

            @if (st.fields.length) {
              <dl class="fields">
                @for (f of st.fields; track f.key) {
                  <div class="f" [class.wide]="f.kind === 'LONG'" [class.empty]="!f.value" [class.editing]="editing() === f.key">
                    <dt>{{ f.label }}@if (!f.required) { <small> · facultatif</small> }</dt>
                    <dd>
                      @if (editing() === f.key) {
                        <form class="edit" (ngSubmit)="save(f)" (keydown)="keys($event, f)">
                          @if (f.kind === 'DATE') {
                            <div class="when">
                              <p class="when-big">@if (draft) { {{ dayFr(draft, true) }} <span>{{ countdown(draft) }}</span> } @else { Choisissez le jour de la première diffusion }</p>
                              <div class="quick" role="group" aria-label="Raccourcis de date"><span class="q-l">Dans</span>
                                @for (q of dateShortcuts(); track q.label) { <button type="button" class="qchip" [attr.aria-pressed]="draft === q.iso" (click)="draft = q.iso">{{ q.label }}</button> }
                              </div>
                              <app-calendar [value]="draft" (valueChange)="draft = $event" [min]="today" [marks]="marksFor(f)" />
                              @if (dateWarn(f); as w) { <p class="warn" role="status">{{ w }}</p> }
                              <div class="type-row"><span>Ou tapez la date</span><app-date-field name="v" [(ngModel)]="draft" [compact]="true" ariaLabel="Date au format jj/mm/aaaa" /></div>
                            </div>
                          }
                          @else if (f.kind === 'RANGE') {
                            <div class="when">
                              <p class="when-big">@if (rangeOf(draft); as r) { {{ rangeLabel(r) }} <span>{{ rangeDays(r) }}</span> } @else { Cliquez le premier jour, puis le dernier }</p>
                              @if (rawRange()) { <p class="raw">Texte d'origine : « {{ rawRange() }} ». Choisissez les jours dans le calendrier.</p> }
                              <div class="quick" role="group" aria-label="Durée du tournage"><span class="q-l">Durée</span>
                                @for (n of [1, 2, 3, 4, 5]; track n) { <button type="button" class="qchip" [attr.aria-pressed]="lengthOf(draft) === n" (click)="setLength(n)">{{ n }} jour{{ n > 1 ? 's' : '' }}</button> }
                                <button type="button" class="qchip" [disabled]="!rangeOf(draft)" (click)="addReserve()">+ 1 jour de réserve météo</button>
                              </div>
                              <app-calendar mode="range" [value]="draft" (valueChange)="draft = $event" [min]="today" [marks]="marksFor(f)" />
                              @if (rangeWarn(); as w) { <p class="warn" role="status">{{ w }}</p> }
                            </div>
                          }
                          @else if (f.kind === 'LONG') { <textarea name="v" rows="5" maxlength="4000" [(ngModel)]="draft" [placeholder]="f.hint" [attr.aria-label]="f.label" [attr.aria-describedby]="'m-' + f.key"></textarea> }
                          @else { <input name="v" maxlength="300" [(ngModel)]="draft" [placeholder]="f.hint" [attr.aria-label]="f.label" [attr.aria-describedby]="'m-' + f.key" /> }
                          @if (f.kind === 'TEXT' || f.kind === 'LONG') {
                            <p class="meter" [id]="'m-' + f.key"><span [class.over]="over(f)">{{ draft.length }} caractères{{ aide(f).max ? ' · ' + aide(f).max + ' conseillés' : '' }}</span><span class="kbd">Ctrl + Entrée : enregistrer · Échap : annuler</span></p>
                            @if (aide(f).chips; as chips) {
                              <div class="quick" role="group" [attr.aria-label]="'Choix rapides pour ' + f.label">
                                <span class="q-l">{{ aide(f).mode === 'toggle' ? 'Cochez' : aide(f).mode === 'set' ? 'Partir de' : 'Ajouter' }}</span>
                                @for (c of chips; track c) { <button type="button" class="qchip" [attr.aria-pressed]="on(f, c)" (click)="pick(f, c)">{{ c }}</button> }
                              </div>
                            }
                            @if (derivedFor(f); as d) { <button type="button" class="tool hint" (click)="setDraft(d.value)">@if (d.value.includes('\n')) { ✦ {{ d.label }} } @else { {{ d.label }} : <b>{{ d.value }}</b> }</button> }
                            <div class="helpers">
                              <button type="button" class="tool ai" [disabled]="drafting()" (click)="aiDraft(f)">@if (drafting()) { L’IA écrit<i class="dots" aria-hidden="true"><i></i><i></i><i></i></i> } @else { {{ draft.trim() ? '✦ Améliorer avec l’IA' : '✦ Proposer avec l’IA' }} }</button>
                              @if (undoDraft() !== null) { <button type="button" class="tool" (click)="undo()">Revenir à mon texte</button> }
                              @if (aide(f).template && !draft.trim()) { <button type="button" class="tool" (click)="setDraft(aide(f).template!)">Insérer le modèle</button> }
                              @if (aide(f).example) { <button type="button" class="tool" [attr.aria-expanded]="showEx()" (click)="showEx.set(!showEx())">{{ showEx() ? 'Masquer l’exemple' : 'Voir un exemple' }}</button> }
                            </div>
                            @if (showEx() && aide(f).example) { <div class="ex"><p>{{ aide(f).example }}</p><button type="button" class="tool" (click)="setDraft(aide(f).example!); showEx.set(false)">Partir de cet exemple</button></div> }
                            @if (aiNote()) { <p class="ai-note" role="status">{{ aiNote() }}</p> }
                          }
                          <div class="edit-actions">
                            <button type="submit" class="go" [disabled]="busy() || drafting()">Enregistrer</button>
                            @if (nextAfter(st, f)) { <button type="button" class="ghost" [disabled]="busy() || drafting()" (click)="save(f, true)">Enregistrer et passer au suivant</button> }
                            <button type="button" class="ghost" (click)="cancel()">Annuler</button>
                          </div>
                        </form>
                      } @else {
                        @if (f.value) {
                          <p class="val">{{ show(f, f.value) }}</p>
                          @if (dateNote(f); as n) { <span class="date-note" [class.raw-note]="n.raw">{{ n.text }}</span> }
                          @if (f.source === 'IA') { <span class="ai-tag" title="Rempli par l'IA à partir d'un document">✦ Rempli par l'IA{{ f.canEdit ? ' · à vérifier' : '' }}</span> }
                        } @else {
                          <p class="val none">{{ f.canEdit ? f.hint : 'À remplir par ' + by(st.owner) }}</p>
                          @if (f.canEdit && !f.suggestion && aide(f).chips; as chips) {
                            <div class="quick mini" role="group" [attr.aria-label]="'Remplir vite ' + f.label">
                              @for (c of chips.slice(0, 4); track c) { <button type="button" class="qchip" (click)="quickStart(f, c)">{{ c }}</button> }
                            </div>
                          }
                        }
                        @if (f.canEdit && !(f.suggestion && !f.value)) { <button type="button" class="edit-btn" (click)="edit(f)" [attr.aria-label]="(f.value ? 'Modifier ' : 'Remplir ') + f.label">{{ f.value ? 'Modifier' : 'Remplir' }}</button> }
                      }
                      @if (f.suggestion && editing() !== f.key) {
                        @if (f.canEdit) {
                          <div class="sugg" role="group" [attr.aria-label]="'Proposition de l\\'IA pour ' + f.label">
                            <p><span class="ai-tag">✦ L'IA propose{{ f.suggestionFrom ? ', d\\'après le document de ' + f.suggestionFrom : '' }}</span>{{ show(f, f.suggestion) }}</p>
                            <div class="sugg-actions">
                              <button type="button" class="go" [disabled]="busy()" (click)="accept(f)">Accepter</button>
                              <button type="button" class="ghost" [disabled]="busy()" (click)="edit(f, f.suggestion)">Corriger</button>
                              <button type="button" class="ghost" [disabled]="busy()" (click)="reject(f)">Écarter</button>
                            </div>
                          </div>
                        } @else {
                          <p class="pending">✦ Une proposition de l'IA attend {{ by(st.owner) }}.</p>
                        }
                      }
                    </dd>
                  </div>
                }
              </dl>
            } @else if (st.key === 'roles') {
              <ul class="roles">
                @for (ro of st.roles; track ro.id) {
                  <li class="role">
                    <div class="r-head"><b>{{ ro.name }}</b>@if (roleMeta(ro)) { <span class="r-meta">{{ roleMeta(ro) }}</span> }</div>
                    <p class="val" [class.none]="!ro.intention">{{ ro.intention || 'Intention à écrire : ce que l’acteur doit faire passer' }}</p>
                    @if (st.canEdit) {
                      <div class="r-actions">
                        <button type="button" class="edit-btn" (click)="editRole(ro)" [attr.aria-label]="'Modifier le rôle ' + ro.name">Modifier</button>
                        <button type="button" class="edit-btn" [disabled]="busy()" (click)="duplicateRole(ro)" [attr.aria-label]="'Dupliquer le rôle ' + ro.name">Dupliquer</button>
                        <button type="button" class="edit-btn" (click)="removeRole(ro)" [attr.aria-label]="'Retirer le rôle ' + ro.name">Retirer</button>
                      </div>
                    }
                  </li>
                } @empty {
                  <li class="val none">{{ st.canEdit ? 'Ajoutez les personnages à caster : un rôle par personnage, avec son intention.' : 'Les rôles apparaîtront ici quand la réalisation les aura écrits.' }}</li>
                }
              </ul>
              @if (st.canEdit) {
                @if (roleEdit()) {
                  <form class="role-form" (ngSubmit)="saveRole()">
                    @if (roleEdit() === 'new') {
                      <div class="quick" role="group" aria-label="Rôles types"><span class="q-l">Rôles types</span>
                        @for (t of roleTypes; track t.label) { <button type="button" class="qchip" [attr.aria-pressed]="roleDraft.name === t.name" (click)="useRoleType(t)">{{ t.label }}</button> }
                      </div>
                    }
                    <label>Nom du rôle<input name="rn" maxlength="120" [(ngModel)]="roleDraft.name" placeholder="Ex. La grand-mère" /></label>
                    <label>Intention<textarea name="ri" rows="3" maxlength="4000" [(ngModel)]="roleDraft.intention" placeholder="Ce que l'acteur doit faire passer : émotion, présence, rapport aux autres…"></textarea></label>
                    <div class="quick" role="group" aria-label="Ajouter à l'intention"><span class="q-l">Ajouter</span>
                      @for (c of roleIntentions; track c) { <button type="button" class="qchip" [attr.aria-pressed]="roleHas(c)" (click)="roleDraft.intention = addLine(roleDraft.intention ?? '', c)">{{ c }}</button> }
                    </div>
                    <div class="r-row">
                      <label>Sexe<select name="rg" [(ngModel)]="roleDraft.gender"><option [ngValue]="null">Indifférent</option><option value="Femme">Femme</option><option value="Homme">Homme</option></select></label>
                      <label>Âge minimum<input name="ra" type="number" min="0" max="100" [(ngModel)]="roleDraft.minAge" /></label>
                      <label>Âge maximum<input name="rb" type="number" min="0" max="100" [(ngModel)]="roleDraft.maxAge" /></label>
                    </div>
                    <div class="quick" role="group" aria-label="Tranches d'âge"><span class="q-l">Âge</span>
                      @for (a of ageRanges; track a.label) { <button type="button" class="qchip" [attr.aria-pressed]="roleDraft.minAge === a.min && roleDraft.maxAge === a.max" (click)="roleDraft.minAge = a.min; roleDraft.maxAge = a.max">{{ a.label }} ans</button> }
                    </div>
                    <div class="edit-actions">
                      <button type="submit" class="go" [disabled]="busy() || !roleDraft.name.trim()">Enregistrer le rôle</button>
                      <button type="button" class="ghost" (click)="roleEdit.set(null)">Annuler</button>
                    </div>
                  </form>
                } @else {
                  <button type="button" class="ghost add-role" (click)="newRole()">+ Ajouter un rôle</button>
                }
              }
            } @else {
              @if (st.lines.length) {
                <ul class="lines">
                  @for (l of st.lines; track $index) { <li><b>{{ l.title }}</b><span>{{ l.detail }}</span></li> }
                </ul>
              } @else {
                <p class="val none">{{ st.key === 'roles' ? 'Les rôles apparaîtront ici quand la réalisation les aura écrits.' : 'Le casting commence quand la room est ouverte.' }}</p>
              }
            }
          </section>
        }
      </div>
    }
  </article>
  @if (sheet()) { <app-page-rail class="rail-col" [root]="doc" /> }
  </div>
  `,
  styleUrl: './fiche.scss'
})
export class FicheComponent implements AfterViewChecked {
  private readonly api = inject(FicheService);
  private readonly host = inject(ElementRef<HTMLElement>);
  /** Une des deux : la demande (page projet) ou la room. */
  readonly requestId = input<string | null>(null);
  readonly roomId = input<string | null>(null);

  readonly sheet = signal<Sheet | null>(null);
  readonly error = signal('');
  readonly msg = signal('');
  readonly linkErr = signal('');
  readonly busy = signal(false);
  readonly uploading = signal(false);
  readonly editing = signal<string | null>(null);
  readonly shown = signal(0);
  readonly formats = '.pdf,.docx,.pptx,.txt,.rtf';
  draft = '';
  changes = '';
  readonly asking = signal(false);
  /** P-085 · Les aides à la saisie */
  readonly drafting = signal(false);
  readonly undoDraft = signal<string | null>(null);
  readonly aiNote = signal('');
  readonly showEx = signal(false);
  readonly roleTypes = ROLE_TYPES;
  readonly ageRanges = AGE_RANGES;
  readonly roleIntentions = ROLE_INTENTIONS;
  readonly addLine = addLine;
  readonly roleEdit = signal<string | null>(null);
  roleDraft: RoleInput = { name: '', intention: '', gender: null, minAge: null, maxAge: null };
  readonly phases = [{ key: 'brief', label: 'Brief' }, { key: 'reco', label: 'Recommandation' }, { key: 'prepa', label: 'Préparation' }, { key: 'casting', label: 'Casting' }];
  /** Le rédacteur principal de chaque chapitre (le producer peut compléter les autres). */
  private static readonly PRIMARY: Record<string, string> = { brief: 'MARQUE', diffusion: 'MARQUE', concept: 'AGENCE', realisation: 'REAL', production: 'PROD', roles: 'REAL' };
  linkUrl = '';
  private io: IntersectionObserver | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;

  readonly handStage = computed(() => { const s = this.sheet(); return s?.stages.find(x => x.key === s.handStage) ?? null; });
  readonly myStages = computed(() => this.sheet()?.stages.filter(x => this.isPrimary(x)) ?? []);

  constructor() {
    effect(() => { this.requestId(); this.roomId(); untracked(() => this.load()); });
    inject(LiveService).watch(inject(DestroyRef), () => this.load(true), () => this.editing() !== null || this.busy() || this.drafting() || this.roleEdit() !== null || this.asking());
    inject(DestroyRef).onDestroy(() => { this.io?.disconnect(); if (this.poll) clearTimeout(this.poll); });
  }

  /** Révèle chaque bloc quand il entre à l'écran (une seule fois). */
  ngAfterViewChecked(): void {
    const els = this.host.nativeElement.querySelectorAll('.reveal:not(.seen)') as NodeListOf<HTMLElement>;
    if (!els.length) return;
    if (!this.io) {
      if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(e => e.classList.add('seen', 'in')); return; }
      this.io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); this.io!.unobserve(e.target); } }), { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    }
    els.forEach(e => { e.classList.add('seen'); this.io!.observe(e); });
  }

  load(silent = false): void {
    const r = this.requestId(), room = this.roomId();
    if (!r && !room) return;
    (room ? this.api.forRoom(room) : this.api.forRequest(r!)).subscribe({
      next: s => this.apply(s),
      error: (e: HttpErrorResponse) => { if (!silent) this.error.set(e.status === 404 ? 'Cette fiche n’existe pas ou ne vous est pas visible.' : 'Impossible de charger la fiche.'); }
    });
  }

  private apply(s: Sheet): void {
    const first = !this.sheet();
    const before = this.sheet()?.progress ?? 0;
    this.sheet.set(s); this.error.set('');
    // Arrivée depuis une notification (#etape-concept) : on va à l'étape
    if (first && location.hash.startsWith('#etape-')) { const k = location.hash.slice(7); setTimeout(() => this.jump(new Event('x'), k), 500); }
    this.count(before, s.progress);
    // Un document est en cours de lecture : on revient voir toutes les 3 s (en plus des mises à jour en direct)
    if (this.poll) clearTimeout(this.poll);
    if (s.sources.some(x => x.status === 'LECTURE')) this.poll = setTimeout(() => this.load(true), 3000);
  }

  /** Le pourcentage monte doucement jusqu'à sa valeur. */
  private count(from: number, to: number): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { this.shown.set(to); return; }
    const t0 = performance.now(), d = 900;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      this.shown.set(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  edit(f: SheetField, preset?: string | null): void { this.editing.set(f.key); this.draft = preset ?? f.value ?? ''; this.msg.set(''); this.error.set('');
    this.undoDraft.set(null); this.aiNote.set(''); this.showEx.set(false); this.rawRange.set('');
    if (f.kind === 'RANGE' && this.draft && !isoRange(this.draft)) { this.rawRange.set(this.draft); this.draft = parseRange(this.draft); }
    setTimeout(() => (this.host.nativeElement.querySelector('.edit textarea, .edit input') as HTMLElement | null)?.focus()); }
  cancel(): void { this.editing.set(null); this.undoDraft.set(null); this.aiNote.set(''); this.showEx.set(false); }

  save(f: SheetField, next = false): void {
    const s = this.sheet(); if (!s) return;
    const st = s.stages.find(x => x.fields.some(y => y.key === f.key));
    const following = next && st ? this.nextAfter(st, f) : null;
    this.run(this.api.save(s.requestId, f.key, this.draft), `${f.label} : enregistré.`, () => {
      this.editing.set(null);
      if (following) { const fresh = this.sheet()?.stages.flatMap(x => x.fields).find(x => x.key === following.key); if (fresh) this.edit(fresh); }
    });
  }

  // ── P-086 · Les dates au calendrier ──

  readonly today = todayIso();
  readonly dayFr = dayFr;
  /** Texte libre d'origine (lu par l'IA) quand il ne se convertit pas en période. */
  readonly rawRange = signal('');
  private vals(): Record<string, string> { return this.valueMap(); }
  show(f: SheetField, v: string | null): string {
    if (!v) return '';
    if (f.kind === 'DATE') return this.dateFr(v);
    if (f.kind === 'RANGE') { const r = isoRange(v); return r ? this.rangeLabel(r) : v; }
    return v;
  }
  rangeOf(v: string): [string, string] | null { return isoRange(v); }
  rangeLabel([a, b]: [string, string]): string {
    if (a === b) return `Le ${dayFr(a, true)}`;
    return a.slice(0, 7) === b.slice(0, 7) ? `Du ${dayFr(a)} au ${dayFr(b, true)}` : `Du ${dayFr(a, a.slice(0, 4) !== b.slice(0, 4))} au ${dayFr(b, true)}`;
  }
  rangeDays([a, b]: [string, string]): string { const n = daysBetween(a, b) + 1; return `${n} jour${n > 1 ? 's' : ''} de tournage`; }
  lengthOf(v: string): number { const r = isoRange(v); return r ? daysBetween(r[0], r[1]) + 1 : 0; }
  countdown(iso: string): string {
    const n = daysBetween(this.today, iso);
    return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n > 0 ? `dans ${n} jours${n >= 14 ? ' (' + Math.round(n / 7) + ' semaines)' : ''}` : `il y a ${-n} jours`;
  }
  /** Sous la valeur affichée : le compte à rebours, la durée, ou « à convertir » pour un texte libre. */
  dateNote(f: SheetField): { text: string; raw: boolean } | null {
    if (!f.value) return null;
    if (f.kind === 'DATE') return { text: this.countdown(f.value), raw: false };
    if (f.kind === 'RANGE') { const r = isoRange(f.value); return r ? { text: this.rangeDays(r), raw: false } : { text: f.canEdit ? 'Texte libre : ouvrez le calendrier pour fixer les jours' : 'Jours à préciser', raw: true }; }
    return null;
  }
  dateShortcuts(): { label: string; iso: string }[] {
    return [['2 semaines', 14], ['1 mois', 30], ['6 semaines', 42], ['2 mois', 61], ['3 mois', 91]].map(([l, n]) => ({ label: l as string, iso: addDays(this.today, n as number) }));
  }
  /** Les autres dates du dossier, en repères dans le calendrier. */
  marksFor(f: SheetField): CalMark[] {
    const v = this.vals(), out: CalMark[] = [];
    if (f.key !== 'diffusion' && v['diffusion']) out.push({ iso: v['diffusion'], label: 'Diffusion', tone: 'danger' });
    const r = isoRange(v['dates_tournage'] ?? '');
    if (f.key !== 'dates_tournage' && r) for (let d = r[0]; d <= r[1]; d = addDays(d, 1)) out.push({ iso: d, label: 'Tournage', tone: 'success' });
    return out;
  }
  setLength(n: number): void {
    const r = isoRange(this.draft);
    const start = r ? r[0] : this.nextMonday(addDays(this.today, 21));
    this.draft = `${start}/${addDays(start, n - 1)}`;
  }
  addReserve(): void { const r = isoRange(this.draft); if (r) this.draft = `${r[0]}/${addDays(r[1], 1)}`; }
  private nextMonday(iso: string): string { let d = iso; while (new Date(d + 'T12:00').getDay() !== 1) d = addDays(d, 1); return d; }
  /** Ce qu'un producteur vérifierait : assez de temps avant et après le tournage. */
  rangeWarn(): string | null {
    const r = isoRange(this.draft); if (!r) return null;
    const diff = this.vals()['diffusion'];
    if (diff) {
      const gap = daysBetween(r[1], diff);
      if (gap < 0) return `Le tournage finit après la première diffusion (${dayFr(diff, true)}).`;
      if (gap < 21) return `Seulement ${gap} jour${gap > 1 ? 's' : ''} entre la fin du tournage et la diffusion : il faut en général 3 semaines pour le montage, l’étalonnage, le son et les validations.`;
    }
    const before = daysBetween(this.today, r[0]);
    if (before < 14) return `Tournage dans ${before} jour${before > 1 ? 's' : ''} : le casting, les repérages et la PPM seront très serrés (3 semaines conseillées).`;
    return null;
  }
  dateWarn(f: SheetField): string | null {
    if (f.key !== 'diffusion' || !this.draft) return null;
    const r = isoRange(this.vals()['dates_tournage'] ?? '');
    if (r) {
      const gap = daysBetween(r[1], this.draft);
      if (gap < 0) return `Cette date tombe avant la fin du tournage (${dayFr(r[1], true)}).`;
      if (gap < 21) return `Seulement ${gap} jour${gap > 1 ? 's' : ''} après la fin du tournage : 3 semaines sont conseillées pour la post-production.`;
    } else if (daysBetween(this.today, this.draft) < 35) return 'Moins de 5 semaines pour préparer, tourner et livrer : c’est très court pour un film publicitaire.';
    return null;
  }

  // ── P-085 · Aides à la saisie ──

  aide(f: SheetField): Aide { return AIDES[f.key] ?? {}; }
  over(f: SheetField): boolean { const m = this.aide(f).max; return !!m && this.draft.length > m; }
  on(f: SheetField, c: string): boolean { return hasIn(this.draft, c, this.aide(f).mode ?? 'line'); }
  /** Un choix rapide : coché dans une liste, ajouté en ligne, ou point de départ. */
  pick(f: SheetField, c: string): void { this.draft = this.applyChip(f, this.draft, c); }
  private applyChip(f: SheetField, text: string, c: string): string {
    const mode = this.aide(f).mode ?? 'line';
    return mode === 'toggle' ? toggleIn(text, c) : mode === 'set' ? c : addLine(text, c);
  }
  quickStart(f: SheetField, c: string): void { this.edit(f, this.applyChip(f, '', c)); }
  setDraft(v: string): void { this.undoDraft.set(this.draft); this.draft = v; }
  undo(): void { const u = this.undoDraft(); if (u !== null) { this.draft = u; this.undoDraft.set(null); this.aiNote.set(''); } }
  derivedFor(f: SheetField): { label: string; value: string } | null {
    const d = derived(f.key, this.valueMap());
    return d && d.value !== this.draft.trim() ? d : null;
  }
  private valueMap(): Record<string, string> {
    const m: Record<string, string> = {};
    this.sheet()?.stages.forEach(st => st.fields.forEach(x => { if (x.value) m[x.key] = x.value; }));
    return m;
  }
  /** L'IA rédige (ou améliore) le champ à partir du reste de la fiche ; rien n'est enregistré avant relecture. */
  aiDraft(f: SheetField): void {
    const s = this.sheet(); if (!s) return;
    const before = this.draft;
    this.drafting.set(true); this.aiNote.set('');
    this.api.propose(s.requestId, f.key, before).subscribe({
      next: r => {
        this.drafting.set(false);
        if (this.editing() !== f.key) return;
        if (r.text) { this.undoDraft.set(before); this.draft = r.text; this.aiNote.set('✦ Texte proposé par l’IA d’après la fiche : relisez, ajustez, puis enregistrez.'); }
        else this.aiNote.set('L’IA n’est pas disponible pour le moment. Utilisez les choix rapides, le modèle ou l’exemple.');
      },
      error: (e: HttpErrorResponse) => { this.drafting.set(false); this.aiNote.set(e.error?.message || 'L’IA n’a pas pu répondre. Réessayez dans un instant.'); }
    });
  }
  keys(e: KeyboardEvent, f: SheetField): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!this.busy() && !this.drafting()) this.save(f); }
    else if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
  }
  /** Le champ suivant du chapitre que je peux écrire et qui est encore vide. */
  nextAfter(st: SheetStage, f: SheetField): SheetField | null {
    const i = st.fields.findIndex(x => x.key === f.key);
    return st.fields.slice(i + 1).find(x => x.canEdit && !x.value) ?? null;
  }
  firstEmpty(st: SheetStage): SheetField | null { return st.fields.find(x => x.canEdit && !x.value && !x.suggestion) ?? st.fields.find(x => x.canEdit && !x.value) ?? null; }
  pendingSugg(st: SheetStage): SheetField[] { return st.fields.filter(x => x.canEdit && x.suggestion); }
  /** Ce qui reste à faire pour moi, dans la phase en cours : d'abord les champs obligatoires de mes chapitres. */
  readonly nextTodo = computed(() => {
    const s = this.sheet(); if (!s) return null;
    const stages = s.stages.filter(st => st.canEdit && this.current(st) && st.fields.length);
    for (const pass of [(st: SheetStage) => this.isPrimary(st), () => true]) {
      for (const st of stages.filter(pass)) { const f = st.fields.find(x => x.canEdit && !x.value && x.required); if (f) return { st, f }; }
    }
    return null;
  });
  openField(st: SheetStage, f: SheetField): void {
    this.jump(new Event('x'), st.key);
    setTimeout(() => this.edit(f, f.suggestion && !f.value ? f.suggestion : null), 350);
  }
  acceptAll(st: SheetStage): void {
    const s = this.sheet(); const list = this.pendingSugg(st); if (!s || !list.length) return;
    this.run(concat(...list.map(f => this.api.accept(s.requestId, f.key))).pipe(last()), `${list.length} propositions acceptées dans « ${st.title} ».`);
  }
  private stageText(st: SheetStage): string {
    const rows = st.fields.filter(f => f.value).map(f => `${f.label} : ${this.show(f, f.value)}`);
    const roles = st.roles.map(r => `• ${r.name}${this.roleMeta(r) ? ' (' + this.roleMeta(r) + ')' : ''}${r.intention ? ' : ' + r.intention : ''}`);
    return [`${this.pad(st.num)} ${st.title}`, ...rows, ...roles].join('\n');
  }
  copyStage(st: SheetStage): void { this.copy(this.stageText(st), `Chapitre « ${st.title} » copié.`); }
  copyAll(): void {
    const s = this.sheet(); if (!s) return;
    const body = s.stages.filter(st => st.filled || st.roles.length).map(st => this.stageText(st)).join('\n\n');
    this.copy(`${s.title}${s.brandName ? ' · ' + s.brandName : ''}\nPhase : ${s.gate.title} · fiche remplie à ${s.progress} %\n\n${body}`, 'Résumé du dossier copié : collez-le dans un mail ou un message.');
  }
  private copy(text: string, ok: string): void {
    const done = () => { this.error.set(''); this.msg.set(ok); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => this.error.set('La copie a été refusée par le navigateur.'));
    else this.error.set('La copie n’est pas disponible dans ce navigateur.');
  }
  print(): void { this.host.nativeElement.querySelectorAll('.reveal').forEach((e: Element) => e.classList.add('in')); setTimeout(() => window.print(), 50); }
  accept(f: SheetField): void { const s = this.sheet(); if (s) this.run(this.api.accept(s.requestId, f.key), `${f.label} : proposition acceptée.`); }
  reject(f: SheetField): void { const s = this.sheet(); if (s) this.run(this.api.reject(s.requestId, f.key), `${f.label} : proposition écartée.`); }

  upload(file: File): void {
    const s = this.sheet(); if (!s) return;
    this.uploading.set(true); this.linkErr.set(''); this.error.set('');
    this.api.upload(s.requestId, file).subscribe({
      next: x => { this.uploading.set(false); this.apply(x); this.msg.set(`« ${file.name} » déposé : l'IA le lit.`); },
      error: (e: HttpErrorResponse) => { this.uploading.set(false); this.error.set(e.error?.message || 'Le document n’a pas pu être envoyé.'); }
    });
  }

  sendLink(): void {
    const s = this.sheet(); const u = this.linkUrl.trim(); if (!s || !u) return;
    this.uploading.set(true); this.linkErr.set('');
    this.api.link(s.requestId, u).subscribe({
      next: x => { this.uploading.set(false); this.linkUrl = ''; this.apply(x); this.msg.set('Lien déposé : l’IA le lit.'); },
      error: (e: HttpErrorResponse) => { this.uploading.set(false); this.linkErr.set(e.error?.message || 'Ce lien n’a pas pu être lu.'); }
    });
  }

  private run(obs: import('rxjs').Observable<Sheet>, ok: string, then?: () => void): void {
    this.busy.set(true); this.error.set(''); this.msg.set('');
    obs.subscribe({
      next: s => { this.busy.set(false); this.apply(s); this.msg.set(ok); then?.(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message || 'L’enregistrement a échoué. Réessayez.'); }
    });
  }

  /** Le chapitre appartient-il à la phase en cours (ou à une phase passée) ? */
  current(st: SheetStage): boolean {
    const phase: Record<string, number> = { brief: 0, diffusion: 0, concept: 1, realisation: 2, production: 2, roles: 2, casting: 3 };
    return (phase[st.key] ?? 0) <= (this.sheet()?.gate.phaseIndex ?? 0);
  }
  isPrimary(st: SheetStage): boolean {
    const s = this.sheet(); const p = FicheComponent.PRIMARY[st.key];
    if (!s || !p) return false;
    // Sans réalisateur rattaché, le producer porte aussi la réalisation et les rôles
    return s.mySides.includes(p) || (p === 'REAL' && s.mySides.includes('PROD') && !s.mySides.includes('REAL') && st.canEdit && !this.hasDirector());
  }
  /** Indice : un réalisateur a-t-il déjà écrit dans le dossier ? (sinon le producer porte la réalisation) */
  private hasDirector(): boolean { return !!this.directorAttached(); }
  readonly directorAttached = input(false);

  step(action: string): void {
    const s = this.sheet(); if (!s) return;
    const label = s.gate.actionLabel ?? 'Étape validée';
    this.run(this.api.step(s.requestId, action), this.done(action) ?? label, () => this.asking.set(false));
  }
  private done(action: string): string | null {
    return ({ transmettre: 'Brief transmis à l’agence.', presenter: 'Recommandation présentée à la marque.', valider: 'Recommandation validée : la préparation commence.', lancer: 'Casting lancé : la room est ouverte.' } as Record<string, string>)[action] ?? null;
  }
  askChanges(): void {
    const s = this.sheet(); const c = this.changes.trim(); if (!s || !c) return;
    this.run(this.api.step(s.requestId, 'modifier', c), 'Demande de modifications envoyée à l’agence.', () => { this.asking.set(false); this.changes = ''; });
  }
  cleanFeedback(f: string): string { return f.replace(/^Modifications demandées par la marque : /, '').replace(/^V1[^:]* à revoir : /, ''); }

  newRole(): void { this.roleDraft = { name: '', intention: '', gender: null, minAge: null, maxAge: null }; this.roleEdit.set('new'); }
  editRole(r: SheetRole): void { this.roleDraft = { name: r.name, intention: r.intention ?? '', gender: r.gender, minAge: r.minAge, maxAge: r.maxAge }; this.roleEdit.set(r.id); }
  saveRole(): void {
    const s = this.sheet(); const id = this.roleEdit(); if (!s || !id) return;
    const body: RoleInput = { ...this.roleDraft, name: this.roleDraft.name.trim(), minAge: this.num(this.roleDraft.minAge), maxAge: this.num(this.roleDraft.maxAge) };
    this.run(id === 'new' ? this.api.addRole(s.requestId, body) : this.api.updateRole(s.requestId, id, body), `Rôle « ${body.name} » enregistré.`, () => this.roleEdit.set(null));
  }
  useRoleType(t: RoleInput & { label: string }): void { this.roleDraft = { ...this.roleDraft, name: t.name, gender: t.gender, minAge: t.minAge, maxAge: t.maxAge }; }
  roleHas(c: string): boolean { return hasIn(this.roleDraft.intention ?? '', c, 'line'); }
  duplicateRole(r: SheetRole): void {
    const s = this.sheet(); if (!s) return;
    const body: RoleInput = { name: `${r.name} (2)`, intention: r.intention ?? '', gender: r.gender, minAge: r.minAge, maxAge: r.maxAge };
    this.run(this.api.addRole(s.requestId, body), `Rôle « ${body.name} » ajouté : renommez-le si besoin.`);
  }
  removeRole(r: SheetRole): void { const s = this.sheet(); if (s) this.run(this.api.deleteRole(s.requestId, r.id), `Rôle « ${r.name} » retiré.`); }
  roleMeta(r: SheetRole): string {
    const age = r.minAge != null && r.maxAge != null ? `${r.minAge} à ${r.maxAge} ans` : r.minAge != null ? `${r.minAge} ans et plus` : r.maxAge != null ? `jusqu’à ${r.maxAge} ans` : '';
    return [r.gender ?? '', age].filter(x => x).join(' · ');
  }
  private num(v: unknown): number | null { const n = v === '' || v == null ? NaN : Number(v); return Number.isFinite(n) ? n : null; }

  jump(e: Event, key: string): void {
    e.preventDefault();
    const el = this.host.nativeElement.querySelector(key === 'phase' ? '#phase' : '#etape-' + key) as HTMLElement | null;
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    (el?.querySelector('h2') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    (el?.querySelector('h2') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  resultLine(src: SheetSource): string {
    if (!src.filled && !src.proposed) return 'Rien à reprendre';
    const parts: string[] = [];
    if (src.filled) parts.push(`${src.filled} champ${src.filled > 1 ? 's' : ''} rempli${src.filled > 1 ? 's' : ''}`);
    if (src.proposed) parts.push(`${src.proposed} proposition${src.proposed > 1 ? 's' : ''} envoyée${src.proposed > 1 ? 's' : ''}`);
    return parts.join(', ') + (src.engine === 'REGLES' ? ' (sans IA)' : '');
  }

  stateLabel(s: SheetStage['state']): string { return s === 'complete' ? 'Complète' : s === 'encours' ? 'En cours' : 'À remplir'; }
  /** « par le producer », « par la marque »… */
  by(owner: string): string {
    const m: Record<string, string> = { 'Producer': 'le producer', 'Marque': 'la marque', 'Agence marketing': 'l’agence marketing', 'Réalisation': 'la réalisation', 'Toute l\'équipe': 'toute l’équipe' };
    return m[owner] ?? owner.toLowerCase();
  }
  pad(n: number): string { return String(n).padStart(2, '0'); }
  dateFr(iso: string): string { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso; }
  ago(iso: string): string {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return this.dateFr(iso);
  }
}
