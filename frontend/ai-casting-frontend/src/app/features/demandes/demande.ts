import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { CharacterRequest, DemandeCharacter, PersonOption } from '../../core/services/demande.service';
import { AgencyOption, DemandeDetail, DemandeRequest, DemandeService, DemandeStatus, DemandeVersion, STATUS_LABEL } from '../../core/services/demande.service';

/** Étapes affichées dans le suivi, dans l'ordre du cycle (cahier v2). */
const STEPS: { key: DemandeStatus[]; label: string }[] = [
  { key: ['BROUILLON'], label: 'Brouillon' },
  { key: ['V0_ENVOYEE'], label: 'V0 envoyée' },
  { key: ['V1_EN_COURS', 'V1_LIVREE'], label: 'V1 agence' },
  { key: ['V2_EN_COURS', 'V2_LIVREE'], label: 'V2 réalisateur' },
  { key: ['CASTING'], label: 'Casting' },
  { key: ['PPM'], label: 'PPM' },
  { key: ['ACTEURS_VALIDES', 'CLOTUREE'], label: 'Acteurs validés' }
];
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.odt,.odp,.key,.pages,.txt,.rtf,.jpg,.jpeg,.png';

/**
 * Sprint 2 · T-158 / T-159 : une demande de publicité.
 * La marque la crée, écrit ou dépose sa V0 (fichier artistique, sans budget), choisit l'agence et l'envoie.
 * L'agence la lit en lecture seule. Le suivi montre l'étape en cours et le journal de la demande.
 */
@Component({
  selector: 'app-demande',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, NgTemplateOutlet],
  template: `
  <section class="page">
    <a class="back" routerLink="/mes-demandes">← Mes demandes</a>

    @if (loading()) { <p class="muted">Chargement…</p> }
    @else if (fatal()) { <p class="err" role="alert">{{ fatal() }}</p> }
    @else {
      <header class="head">
        <h1>{{ d()?.title || 'Nouvelle demande de publicité' }}</h1>
        @if (d(); as x) {
          <p>{{ x.brandName }}{{ x.agencyName ? ' → ' + x.agencyName : '' }}{{ x.productionName ? ' → ' + x.productionName : '' }} · {{ statusLabel(x.status) }}{{ x.status === 'V1_LIVREE' && x.v1Validated ? ' · V1 validée' : '' }}</p>
        } @else {
          <p>Décrivez votre projet, puis déposez votre V0. Vous pourrez la modifier tant qu'elle n'est pas envoyée.</p>
        }
      </header>

      @if (d(); as x) {
        <ol class="steps" aria-label="Étapes de la demande">
          @for (s of steps; track s.label; let i = $index) {
            <li [class.done]="i < stepIndex()" [class.now]="i === stepIndex()" [attr.aria-current]="i === stepIndex() ? 'step' : null">
              <span class="dot" aria-hidden="true"></span>{{ s.label }}
            </li>
          }
        </ol>
        @if (x.status === 'ANNULEE') { <p class="note">Cette demande a été annulée.</p> }
      }

      @if (refusal(); as r) { <p class="note warn">{{ r }} Vous pouvez la modifier et l'envoyer à une autre agence.</p> }
      @if (msg()) { <p class="ok" role="status">{{ msg() }}</p> }
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      @if (editable()) {
        <form class="card" (ngSubmit)="save()" #f="ngForm">
          <h2>Le projet</h2>
          <label>Titre de la demande *<input name="title" [(ngModel)]="form.title" required maxlength="160" placeholder="Ex. Lancement printemps 2027"></label>
          <div class="two">
            <label>Produit ou service<input name="product" [(ngModel)]="form.product" maxlength="160"></label>
            <label>Date de diffusion souhaitée<input name="airDate" type="date" [(ngModel)]="form.airDate" [min]="today"></label>
          </div>
          <label>Objectif<textarea name="objective" [(ngModel)]="form.objective" rows="2" maxlength="2000" placeholder="Ce que la publicité doit faire : faire connaître, faire acheter…"></textarea></label>
          <label>Cible<textarea name="target" [(ngModel)]="form.target" rows="2" maxlength="2000" placeholder="À qui elle s'adresse"></textarea></label>
          <label>Message clé<textarea name="keyMessage" [(ngModel)]="form.keyMessage" rows="2" maxlength="2000"></textarea></label>
          <div class="row"><button class="send" type="submit" [disabled]="busy() || !form.title.trim()">{{ d() ? 'Enregistrer le projet' : 'Créer la demande' }}</button></div>
        </form>

        @if (d(); as x) {
          <div class="card">
            <h2>Votre V0</h2>
            <p class="muted">Le fichier artistique de votre idée : détails du projet, messages, notes, références. Pas de budget.</p>
            <label>Texte de la V0<textarea name="v0" [(ngModel)]="v0Text" rows="7" maxlength="20000" placeholder="Racontez votre idée de publicité…"></textarea></label>
            <div class="row"><button type="button" class="ghost" (click)="saveV0()" [disabled]="busy()">Enregistrer le texte</button></div>

            <div class="file">
              @if (v0()?.fileName) {
                <span>📎 {{ v0()!.fileName }} · {{ size(v0()!.fileSize) }}</span>
                <button type="button" class="link" (click)="download(v0()!)">Télécharger</button>
                <button type="button" class="link danger" (click)="removeFile()" [disabled]="busy()">Retirer</button>
              } @else {
                <label class="drop">
                  <input type="file" [accept]="acceptTypes" (change)="upload($event)" [disabled]="busy()">
                  <b>Déposer un fichier</b><span>PDF, Word, PowerPoint, Keynote, image… 20 Mo maximum</span>
                </label>
              }
            </div>
          </div>

          <div class="card">
            <h2>Envoyer à l'agence marketing</h2>
            @if (agencies().length) {
              <label>Agence<select name="agency" [(ngModel)]="agencyId">
                <option [ngValue]="null" disabled>Choisissez l'agence</option>
                @for (a of agencies(); track a.id) { <option [ngValue]="a.id">{{ a.name }}{{ a.city ? ' · ' + a.city : '' }}</option> }
              </select></label>
            } @else { <p class="muted">Aucune agence marketing n'est encore inscrite sur la plateforme.</p> }
            <p class="muted">Une fois envoyée, la V0 est figée et l'agence reçoit une notification.</p>
            <div class="row">
              <button type="button" class="send" (click)="send()" [disabled]="busy() || !agencyId || !hasV0()">Envoyer à l'agence</button>
              <button type="button" class="link danger" (click)="remove()" [disabled]="busy()">Supprimer le brouillon</button>
            </div>
            @if (!hasV0()) { <p class="hint">Écrivez votre V0 ou déposez un fichier avant d'envoyer.</p> }
          </div>
        }
      } @else if (d(); as x) {
        <div class="card">
          <h2>Le projet</h2>
          <dl>
            @if (x.product) { <dt>Produit</dt><dd>{{ x.product }}</dd> }
            @if (x.airDate) { <dt>Diffusion</dt><dd>{{ x.airDate | date:'d MMMM y' }}</dd> }
            @if (x.objective) { <dt>Objectif</dt><dd>{{ x.objective }}</dd> }
            @if (x.target) { <dt>Cible</dt><dd>{{ x.target }}</dd> }
            @if (x.keyMessage) { <dt>Message clé</dt><dd>{{ x.keyMessage }}</dd> }
            <dt>Créée par</dt><dd>{{ x.createdByName }} · {{ x.createdAt | date:'d MMM y' }}</dd>
          </dl>
        </div>
        @if (x.canRespond) {
          <div class="card answer">
            <h2>Votre réponse à la marque</h2>
            @if (!refusing()) {
              <p class="muted">Acceptez pour préparer votre V1, ou refusez en expliquant pourquoi : la demande revient alors à la marque.</p>
              <div class="row">
                <button type="button" class="send" (click)="accept()" [disabled]="busy()">Accepter la demande</button>
                <button type="button" class="ghost" (click)="refusing.set(true)" [disabled]="busy()">Refuser…</button>
              </div>
            } @else {
              <label>Motif du refus, envoyé à la marque *<textarea name="reason" [(ngModel)]="reason" rows="3" maxlength="1000" placeholder="Ex. Pas de disponibilité avant mars"></textarea></label>
              <div class="row">
                <button type="button" class="send danger-bg" (click)="refuse()" [disabled]="busy() || !reason.trim()">Refuser la demande</button>
                <button type="button" class="link" (click)="refusing.set(false)">Revenir</button>
              </div>
            }
          </div>
        }
        @if (x.canAnalyse) {
          <div class="card ai">
            <div class="ai-head">
              <h2>Analyse de la V0</h2>
              <button type="button" class="ghost" (click)="analyse()" [disabled]="analysing()">{{ analysing() ? 'Lecture en cours…' : x.analysis ? 'Relancer l’analyse' : 'Analyser la V0' }}</button>
            </div>
            @if (analysing()) {
              <p class="muted" role="status">L'IA locale lit la V0 et son fichier. Cela prend de 10 secondes à une minute.</p>
            } @else if (x.analysis; as a) {
              <p class="src">{{ a.source === 'IA' ? 'Analyse de l’IA locale' : 'L’IA locale n’a pas répondu : points vérifiés automatiquement' }} · {{ a.at | date:'d MMM, HH:mm' }}. À relire : c’est une aide, pas un avis.</p>
              <h3>Résumé</h3>
              <p class="body">{{ a.summary }}</p>
              @if (a.missing.length) {
                <h3>Ce qui manque</h3>
                <ul class="pts">@for (m of a.missing; track $index) { <li>{{ m }}</li> }</ul>
              }
              @if (a.questions.length) {
                <h3>Questions à poser à la marque</h3>
                <ul class="pts">@for (q of a.questions; track $index) { <li>{{ q }}</li> }</ul>
                <button type="button" class="link" (click)="copyQuestions(a.questions)">Copier les questions</button>
              }
            } @else {
              <p class="muted">Un résumé de la V0, ce qui manque pour écrire votre concept et les questions à poser à la marque. L'analyse se fait sur la machine, rien n'est envoyé ailleurs.</p>
            }
          </div>
        }
        @if (x.canEditV1) {
          <div class="card answer">
            <h2>Votre {{ draftLabel() }}</h2>
            @if (lastReview(); as rv) { <p class="note warn"><b>{{ rv.label }} à revoir :</b> {{ rv.reviewComment }}</p> }
            <p class="muted">Le concept de la publicité, à partir de la V0 : histoire, ton, personnages, déroulé. Une fois livrée, la version est figée.</p>
            <label>Texte de la {{ draftLabel() }}<textarea name="v1" [(ngModel)]="v1Text" rows="8" maxlength="20000" placeholder="Votre concept…"></textarea></label>
            <div class="row"><button type="button" class="ghost" (click)="saveV1()" [disabled]="busy()">Enregistrer le texte</button></div>
            <div class="file">
              @if (v1Draft()?.fileName) {
                <span>📎 {{ v1Draft()!.fileName }} · {{ size(v1Draft()!.fileSize) }}</span>
                <button type="button" class="link" (click)="download(v1Draft()!)">Télécharger</button>
                <button type="button" class="link danger" (click)="removeV1File()" [disabled]="busy()">Retirer</button>
              } @else {
                <label class="drop">
                  <input type="file" [accept]="acceptTypes" (change)="uploadV1($event)" [disabled]="busy()">
                  <b>Déposer le fichier de la {{ draftLabel() }}</b><span>PDF, Word, PowerPoint, Keynote, image… 20 Mo maximum</span>
                </label>
              }
            </div>
            <div class="row"><button type="button" class="send" (click)="deliverV1()" [disabled]="busy() || !(v1Text.trim() || v1Draft()?.fileName)">Livrer la {{ draftLabel() }} à la marque</button></div>
          </div>
        }
        @if (x.canReviewV1) {
          <div class="card answer">
            <h2>Votre avis sur la {{ lastDelivered()?.label }}</h2>
            @if (!revising()) {
              <p class="muted">Validez le concept pour que l'agence choisisse la boîte de production, ou demandez une révision en expliquant quoi changer.</p>
              <div class="row">
                <button type="button" class="send" (click)="validateV1()" [disabled]="busy()">Valider la {{ lastDelivered()?.label }}</button>
                <button type="button" class="ghost" (click)="revising.set(true)" [disabled]="busy()">Demander une révision…</button>
              </div>
            } @else {
              <label>Ce qu'il faut revoir, envoyé à l'agence *<textarea name="comment" [(ngModel)]="comment" rows="3" maxlength="2000" placeholder="Ex. Montrez la famille, pas seulement le paysage"></textarea></label>
              <div class="row">
                <button type="button" class="send" (click)="reviseV1()" [disabled]="busy() || !comment.trim()">Envoyer la demande de révision</button>
                <button type="button" class="link" (click)="revising.set(false)">Revenir</button>
              </div>
            }
          </div>
        }
        @if (x.canChooseProduction) {
          <div class="card answer">
            <h2>Confier à une boîte de production</h2>
            <p class="muted">La marque a validé votre V1. La production recueillera les attentes sur les profils, puis le réalisateur écrira la V2.</p>
            @if (productions().length) {
              <label>Boîte de production<select name="prod" [(ngModel)]="productionId">
                <option [ngValue]="null" disabled>Choisissez la boîte de production</option>
                @for (p of productions(); track p.id) { <option [ngValue]="p.id">{{ p.name }}{{ p.city ? ' · ' + p.city : '' }}</option> }
              </select></label>
              <div class="row"><button type="button" class="send" (click)="chooseProduction()" [disabled]="busy() || !productionId">Confier la production</button></div>
            } @else { <p class="muted">Aucune boîte de production n'est encore inscrite sur la plateforme.</p> }
          </div>
        }
        @if (x.canEditExpectations || x.characters.length) {
          <div class="card" [class.answer]="x.canEditExpectations">
            <h2>Attentes sur les profils</h2>
            @if (x.expectationsSentAt) {
              <p class="src">Transmises à {{ x.directorName }}{{ x.firstAdName ? ' (réalisateur) et ' + x.firstAdName + ' (1er AD)' : ' (réalisateur)' }} le {{ x.expectationsSentAt | date:'d MMM, HH:mm' }}.</p>
            }
            @if (x.canEditExpectations) {
              <p class="muted">Pour chaque personnage, notez ce que la marque et l'agence souhaitent voir. Le réalisateur et le 1er AD s'en serviront pour écrire l'intention de chaque rôle dans la V2.</p>
            }
            <ul class="chars">
              @for (c of x.characters; track c.id) {
                <li>
                  @if (editingId() === c.id) {
                    <ng-container *ngTemplateOutlet="charEditor"></ng-container>
                  } @else {
                    <div class="char-head"><b>{{ c.name }}</b>
                      @if (x.canEditExpectations) {
                        <span class="row"><button type="button" class="link" (click)="editChar(c)">Modifier</button>
                        <button type="button" class="link danger" (click)="deleteChar(c)" [disabled]="busy()">Retirer</button></span>
                      }
                    </div>
                    <dl>
                      @if (c.story) { <dt>Dans l'histoire</dt><dd>{{ c.story }}</dd> }
                      @if (c.brandWish) { <dt>La marque souhaite</dt><dd>{{ c.brandWish }}</dd> }
                      @if (c.agencyWish) { <dt>L'agence souhaite</dt><dd>{{ c.agencyWish }}</dd> }
                      @if (c.notes) { <dt>Production</dt><dd>{{ c.notes }}</dd> }
                    </dl>
                  }
                </li>
              }
            </ul>
            @if (x.canEditExpectations) {
              @if (editingId() === 'new') { <ng-container *ngTemplateOutlet="charEditor"></ng-container> }
              @else if (!editingId()) { <div class="row"><button type="button" class="ghost" (click)="newChar()">Ajouter un personnage</button></div> }

              <h3>Transmettre au réalisateur et au 1er AD</h3>
              @if (directors().length) {
                <div class="two">
                  <label>Réalisateur *<select name="director" [(ngModel)]="directorId">
                    <option [ngValue]="null" disabled>Choisissez le réalisateur</option>
                    @for (p of directors(); track p.id) { <option [ngValue]="p.id">{{ p.name }}{{ p.organisation ? ' · ' + p.organisation : '' }}</option> }
                  </select></label>
                  <label>1er AD (facultatif)<select name="firstAd" [(ngModel)]="firstAdId">
                    <option [ngValue]="null">Aucun pour l'instant</option>
                    @for (p of directors(); track p.id) { @if (p.id !== directorId) { <option [ngValue]="p.id">{{ p.name }}{{ p.organisation ? ' · ' + p.organisation : '' }}</option> } }
                  </select></label>
                </div>
                <div class="row"><button type="button" class="send" (click)="transmit()" [disabled]="busy() || !directorId || !x.characters.length">{{ x.expectationsSentAt ? 'Transmettre la mise à jour' : 'Transmettre les attentes' }}</button></div>
                @if (!x.characters.length) { <p class="hint">Ajoutez au moins un personnage avant de transmettre.</p> }
              } @else { <p class="muted">Aucun réalisateur n'est encore inscrit sur la plateforme.</p> }
            }
          </div>
        }
        <ng-template #charEditor>
          <div class="char-form">
            <label>Personnage *<input name="cname" [(ngModel)]="charForm.name" maxlength="120" placeholder="Ex. Leila, la mère, le grand-père…"></label>
            <label>Sa place dans l'histoire<textarea name="cstory" [(ngModel)]="charForm.story" rows="2" maxlength="4000"></textarea></label>
            <div class="two">
              <label>Ce que la marque souhaite voir<textarea name="cbrand" [(ngModel)]="charForm.brandWish" rows="3" maxlength="4000" placeholder="Âge, allure, style…"></textarea></label>
              <label>Ce que l'agence souhaite voir<textarea name="cagency" [(ngModel)]="charForm.agencyWish" rows="3" maxlength="4000"></textarea></label>
            </div>
            <label>Remarques de la production<textarea name="cnotes" [(ngModel)]="charForm.notes" rows="2" maxlength="4000" placeholder="Disponibilités, figuration, contraintes…"></textarea></label>
            <div class="row">
              <button type="button" class="send" (click)="saveChar()" [disabled]="busy() || !charForm.name.trim()">{{ editingId() === 'new' ? 'Ajouter le personnage' : 'Enregistrer' }}</button>
              <button type="button" class="link" (click)="editingId.set(null)">Annuler</button>
            </div>
          </div>
        </ng-template>
        @for (v of shownVersions(); track v.id) {
          <div class="card">
            <h2>{{ v.label }} <small>{{ v.status === 'LIVREE' ? 'livrée' : v.status === 'A_REVISER' ? 'renvoyée en révision' : 'brouillon' }}{{ v.deliveredAt ? ' le ' + (v.deliveredAt | date:'d MMM') : '' }}{{ v.authorName ? ' · ' + v.authorName : '' }}</small></h2>
            @if (v.reviewComment) { <p class="note warn"><b>Révision demandée :</b> {{ v.reviewComment }}</p> }
            @if (v.body) { <p class="body">{{ v.body }}</p> }
            @if (v.fileName) {
              <div class="file"><span>📎 {{ v.fileName }} · {{ size(v.fileSize) }}</span>
                <button type="button" class="link" (click)="download(v)">Télécharger</button></div>
            }
          </div>
        }
        @if (x.status === 'V0_ENVOYEE' && isBrandSide()) {
          <div class="row"><button type="button" class="link danger" (click)="cancel()" [disabled]="busy()">Annuler la demande</button></div>
        }
      }

      @if (d()?.events?.length) {
        <div class="card">
          <h2>Journal</h2>
          <ul class="journal">
            @for (e of d()!.events; track $index) {
              <li><time>{{ e.createdAt | date:'d MMM, HH:mm' }}</time><span>{{ e.message }}@if (e.actorName && !e.message.includes(e.actorName)) { <em> · {{ e.actorName }}</em> }</span></li>
            }
          </ul>
        </div>
      }
    }
  </section>`,
  styles: [`
    :host { display: block; }
    .page { padding: 24px 32px 48px; max-width: 860px; display: flex; flex-direction: column; gap: 16px; }
    .back { color: var(--text-muted); text-decoration: none; font-size: 13.5px; }
    .back:hover { color: var(--text-primary); }
    .head h1 { font-size: 34px; line-height: 1.08; margin: 0; }
    .head p { margin: 6px 0 0; color: var(--text-muted); font-size: 14.5px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--text-muted); }
    .steps li { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--border); }
    .steps .done .dot { background: var(--accent); border-color: var(--accent); }
    .steps .now { color: var(--text-primary); font-weight: 700; }
    .steps .now .dot { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
    .card { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 14px; border: 1px solid var(--border); }
    .card h2 { margin: 0; font-size: 18px; }
    .card h2 small { font-size: 12.5px; font-weight: 500; color: var(--text-muted); margin-left: 6px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-muted); }
    input:not([type=file]), textarea, select { font: inherit; font-size: 14.5px; font-weight: 400; color: var(--text-primary); background: var(--bg-input, transparent);
      border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    textarea { resize: vertical; line-height: 1.5; }
    input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .send { height: 40px; padding: 0 18px; border-radius: 10px; border: 0; background: var(--accent); color: #111; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .ghost { height: 38px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .link { border: 0; background: none; padding: 4px; color: var(--accent); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .danger { color: #e5484d; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
    .file { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
    .drop { flex: 1; flex-direction: column; align-items: flex-start; padding: 16px; border: 1px dashed var(--border); border-radius: 12px; cursor: pointer; position: relative; }
    .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .drop b { color: var(--text-primary); font-size: 14px; }
    .drop span { font-weight: 400; }
    .drop:focus-within { outline: 2px solid var(--accent); }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; font-size: 14px; }
    dt { color: var(--text-muted); }
    dd { margin: 0; white-space: pre-wrap; }
    .body { white-space: pre-wrap; margin: 0; font-size: 14.5px; line-height: 1.55; }
    .journal { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; }
    .journal li { display: grid; grid-template-columns: 110px 1fr; gap: 10px; }
    .journal time { color: var(--text-muted); }
    .journal em { color: var(--text-muted); font-style: normal; }
    .muted, .hint { color: var(--text-muted); margin: 0; font-size: 13.5px; }
    .note { margin: 0; color: var(--text-muted); }
    .ok { color: #30a46c; margin: 0; }
    .warn { padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, #e5484d 45%, transparent); color: var(--text-primary); }
    .answer { border-color: var(--accent); }
    .danger-bg { background: #e5484d; color: #fff; }
    .ai-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .ai h3 { margin: 4px 0 0; font-size: 14px; }
    .src { margin: 0; font-size: 12.5px; color: var(--text-muted); }
    .chars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .chars > li { padding: 14px; border-radius: 12px; border: 1px solid var(--border); }
    .char-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .char-head b { font-size: 15px; }
    .char-form { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 12px; border: 1px dashed var(--accent); }
    .card h3 { margin: 6px 0 0; font-size: 14px; }
    .pts { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 1.45; }
    .err { color: #e5484d; margin: 0; }
    @media (max-width: 900px) { .page { padding: 18px 14px 104px; } .two { grid-template-columns: 1fr; } .head h1 { font-size: 28px; } }
  `]
})
export class DemandeComponent {
  private readonly api = inject(DemandeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly steps = STEPS;
  readonly acceptTypes = ACCEPT;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly d = signal<DemandeDetail | null>(null);
  readonly agencies = signal<AgencyOption[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly fatal = signal('');
  readonly error = signal('');
  readonly msg = signal('');
  readonly refusing = signal(false);
  readonly revising = signal(false);
  readonly directors = signal<PersonOption[]>([]);
  /** Personnage en cours d'édition : son id, « new » pour un ajout, ou null. */
  readonly editingId = signal<string | null>(null);
  charForm: { name: string; story: string; brandWish: string; agencyWish: string; notes: string } = { name: '', story: '', brandWish: '', agencyWish: '', notes: '' };
  directorId: string | null = null;
  firstAdId: string | null = null;
  readonly productions = signal<AgencyOption[]>([]);
  v1Text = '';
  comment = '';
  productionId: string | null = null;
  readonly v1Draft = computed(() => { const l = (this.d()?.versions ?? []).filter(v => v.kind === 'V1'); const last = l[l.length - 1]; return last && last.status === 'BROUILLON' ? last : null; });
  /** Libellé de la version que l'agence prépare : V1, puis V1.1, V1.2… après chaque révision. */
  readonly draftLabel = computed(() => { if (this.v1Draft()) return this.v1Draft()!.label; const n = (this.d()?.versions ?? []).filter(v => v.kind === 'V1').length; return n ? 'V1.' + n : 'V1'; });
  readonly lastReview = computed(() => [...(this.d()?.versions ?? [])].reverse().find(v => v.kind === 'V1' && v.status === 'A_REVISER') ?? null);
  readonly lastDelivered = computed(() => [...(this.d()?.versions ?? [])].reverse().find(v => v.kind === 'V1' && v.status === 'LIVREE') ?? null);
  /** Les versions affichées en lecture : la plus récente d'abord, sans les brouillons (ils sont dans l'éditeur). */
  readonly shownVersions = computed(() => [...(this.d()?.versions ?? [])].filter(v => v.status !== 'BROUILLON').reverse());
  readonly analysing = signal(false);
  reason = '';
  /** Dernier refus d'une agence, montré à la marque tant que la demande est en brouillon. */
  readonly refusal = computed(() => {
    const x = this.d(); if (!x || x.status !== 'BROUILLON' || !x.canEdit) return null;
    const e = x.events.find(ev => ev.type === 'REFUSEE' || ev.type === 'V0_ENVOYEE');
    return e && e.type === 'REFUSEE' ? e.message + '.' : null;
  });
  form: { title: string; product: string; objective: string; target: string; keyMessage: string; airDate: string } =
    { title: '', product: '', objective: '', target: '', keyMessage: '', airDate: '' };
  v0Text = '';
  agencyId: string | null = null;

  readonly editable = computed(() => !this.d() || this.d()!.canEdit);
  readonly v0 = computed(() => this.d()?.versions.find(v => v.kind === 'V0') ?? null);
  readonly hasV0 = computed(() => !!(this.v0()?.body?.trim() || this.v0()?.fileName));
  readonly stepIndex = computed(() => { const s = this.d()?.status; return s ? STEPS.findIndex(x => x.key.includes(s)) : 0; });
  private readonly auth = inject(AuthService);
  /** Annuler reste réservé à la marque ; le serveur le vérifie aussi. */
  readonly isBrandSide = computed(() => this.auth.role() === 'MARQUE' || this.auth.role() === 'ADMIN');

  constructor() {
    this.route.paramMap.subscribe(p => {
      const id = p.get('id');
      if (!id || id === 'nouvelle') { this.d.set(null); this.loading.set(false); this.loadAgencies(); return; }
      this.load(id);
    });
  }

  statusLabel(s: DemandeStatus) { return STATUS_LABEL[s]; }
  size(n: number | null) { if (!n) return ''; return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo'; }

  private load(id: string) {
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: x => { this.apply(x); this.loading.set(false); if (x.canEdit) this.loadAgencies(); if (x.canChooseProduction) this.loadProductions(); if (x.canEditExpectations) this.loadDirectors(); },
      error: (e: HttpErrorResponse) => { this.fatal.set(e.status === 404 ? 'Cette demande n’existe pas ou ne vous est pas visible.' : 'Impossible de charger la demande.'); this.loading.set(false); }
    });
  }
  private loadDirectors() { this.api.directors().subscribe({ next: p => this.directors.set(p), error: () => this.directors.set([]) }); }
  private loadProductions() { this.api.productions().subscribe({ next: p => this.productions.set(p), error: () => this.productions.set([]) }); }
  private loadAgencies() { this.api.agencies().subscribe({ next: a => this.agencies.set(a), error: () => this.agencies.set([]) }); }

  private apply(x: DemandeDetail) {
    this.d.set(x);
    this.form = { title: x.title, product: x.product ?? '', objective: x.objective ?? '', target: x.target ?? '', keyMessage: x.keyMessage ?? '', airDate: x.airDate ?? '' };
    this.v0Text = x.versions.find(v => v.kind === 'V0')?.body ?? '';
    this.agencyId = x.agencyId ?? this.agencyId;
    const v1 = [...x.versions].reverse().find(v => v.kind === 'V1');
    this.v1Text = v1 && v1.status === 'BROUILLON' ? (v1.body ?? '') : (x.canEditV1 && v1 ? (v1.body ?? '') : '');
    this.revising.set(false); this.comment = '';
    if (x.canChooseProduction && !this.productions().length) this.loadProductions();
  }

  private run<T>(obs: import('rxjs').Observable<T>, ok: string, then?: (r: T) => void) {
    this.busy.set(true); this.error.set(''); this.msg.set('');
    obs.subscribe({
      next: r => { this.busy.set(false); this.msg.set(ok); then?.(r); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message || e.error?.error || 'L’opération a échoué. Réessayez.'); }
    });
  }

  private body(): DemandeRequest {
    const t = (s: string) => s.trim() || null;
    return { title: this.form.title.trim(), product: t(this.form.product), objective: t(this.form.objective), target: t(this.form.target),
      keyMessage: t(this.form.keyMessage), airDate: this.form.airDate || null };
  }

  save() {
    const x = this.d();
    if (!x) this.run(this.api.create(this.body()), 'Demande créée. Déposez maintenant votre V0.', r => { this.apply(r); this.router.navigate(['/demandes', r.id], { replaceUrl: true }); });
    else this.run(this.api.update(x.id, this.body()), 'Projet enregistré.', r => this.apply(r));
  }
  saveV0() { const x = this.d(); if (x) this.run(this.api.saveV0(x.id, this.v0Text), 'Texte de la V0 enregistré.', r => this.apply(r)); }
  upload(ev: Event) {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; const x = this.d();
    if (!file || !x) return;
    if (file.size > 20 * 1024 * 1024) { this.error.set('Le fichier dépasse 20 Mo.'); input.value = ''; return; }
    this.run(this.api.uploadV0(x.id, file), 'Fichier déposé.', r => this.apply(r));
    input.value = '';
  }
  removeFile() { const x = this.d(); if (x) this.run(this.api.removeV0File(x.id), 'Fichier retiré.', r => this.apply(r)); }
  send() {
    const x = this.d(); if (!x || !this.agencyId) return;
    // le texte en cours est enregistré avant l'envoi, pour ne rien perdre
    const text = this.v0Text; const id = x.id; const ag = this.agencyId;
    const go = () => this.run(this.api.send(id, ag), 'Demande envoyée. L’agence a été notifiée.', r => this.apply(r));
    if ((this.v0()?.body ?? '') !== text) { this.busy.set(true); this.api.saveV0(id, text).subscribe({ next: () => go(), error: () => go() }); }
    else go();
  }
  cancel() { const x = this.d(); if (x) this.run(this.api.cancel(x.id), 'Demande annulée.', r => this.apply(r)); }
  remove() {
    const x = this.d(); if (!x) return;
    this.run(this.api.remove(x.id), 'Brouillon supprimé.', () => this.router.navigate(['/mes-demandes']));
  }
  accept() { const x = this.d(); if (x) this.run(this.api.accept(x.id), 'Demande acceptée. La marque est prévenue : à vous la V1.', r => this.apply(r)); }
  refuse() {
    const x = this.d(); if (!x || !this.reason.trim()) return;
    this.run(this.api.refuse(x.id, this.reason.trim()), 'Demande refusée. La marque est prévenue.', () => this.router.navigate(['/mes-demandes']));
  }
  analyse() {
    const x = this.d(); if (!x) return;
    this.analysing.set(true); this.error.set(''); this.msg.set('');
    this.api.analyse(x.id).subscribe({
      next: r => { this.analysing.set(false); this.apply(r); },
      error: (e: HttpErrorResponse) => { this.analysing.set(false); this.error.set(e.error?.message || 'L’analyse a échoué. Réessayez.'); }
    });
  }
  saveV1() { const x = this.d(); if (x) this.run(this.api.saveV1(x.id, this.v1Text), 'Texte enregistré.', r => this.apply(r)); }
  uploadV1(ev: Event) {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; const x = this.d();
    if (!file || !x) return;
    if (file.size > 20 * 1024 * 1024) { this.error.set('Le fichier dépasse 20 Mo.'); input.value = ''; return; }
    this.run(this.api.uploadV1(x.id, file), 'Fichier déposé.', r => this.apply(r)); input.value = '';
  }
  removeV1File() { const x = this.d(); if (x) this.run(this.api.removeV1File(x.id), 'Fichier retiré.', r => this.apply(r)); }
  deliverV1() {
    const x = this.d(); if (!x) return; const id = x.id, label = this.draftLabel();
    const go = () => this.run(this.api.deliverV1(id), label + ' livrée. La marque est prévenue.', r => this.apply(r));
    // le texte en cours est enregistré avant la livraison, pour ne rien perdre
    if ((this.v1Draft()?.body ?? '') !== this.v1Text) { this.busy.set(true); this.api.saveV1(id, this.v1Text).subscribe({ next: () => go(), error: () => go() }); }
    else go();
  }
  validateV1() { const x = this.d(); if (x) this.run(this.api.validateV1(x.id), 'V1 validée. L’agence va choisir la boîte de production.', r => this.apply(r)); }
  reviseV1() { const x = this.d(); if (x && this.comment.trim()) this.run(this.api.reviseV1(x.id, this.comment.trim()), 'Révision demandée. L’agence est prévenue.', r => this.apply(r)); }
  chooseProduction() { const x = this.d(); if (x && this.productionId) this.run(this.api.chooseProduction(x.id, this.productionId), 'Production confiée. La production et la marque sont prévenues.', r => this.apply(r)); }
  newChar() { this.charForm = { name: '', story: '', brandWish: '', agencyWish: '', notes: '' }; this.editingId.set('new'); }
  editChar(c: DemandeCharacter) {
    this.charForm = { name: c.name, story: c.story ?? '', brandWish: c.brandWish ?? '', agencyWish: c.agencyWish ?? '', notes: c.notes ?? '' };
    this.editingId.set(c.id);
  }
  saveChar() {
    const x = this.d(), e = this.editingId(); if (!x || !e || !this.charForm.name.trim()) return;
    const t = (v: string) => v.trim() || null;
    const body: CharacterRequest = { name: this.charForm.name.trim(), story: t(this.charForm.story), brandWish: t(this.charForm.brandWish), agencyWish: t(this.charForm.agencyWish), notes: t(this.charForm.notes) };
    const obs = e === 'new' ? this.api.addCharacter(x.id, body) : this.api.updateCharacter(x.id, e, body);
    this.run(obs, e === 'new' ? 'Personnage ajouté.' : 'Personnage enregistré.', r => { this.editingId.set(null); this.apply(r); });
  }
  deleteChar(c: DemandeCharacter) { const x = this.d(); if (x) this.run(this.api.deleteCharacter(x.id, c.id), c.name + ' retiré.', r => this.apply(r)); }
  transmit() {
    const x = this.d(); if (!x || !this.directorId) return;
    this.run(this.api.transmit(x.id, this.directorId, this.firstAdId), 'Attentes transmises. Le réalisateur est prévenu.', r => this.apply(r));
  }
  copyQuestions(q: string[]) {
    navigator.clipboard?.writeText(q.map(x => '- ' + x).join('\n')).then(() => this.msg.set('Questions copiées.'), () => this.error.set('Copie impossible.'));
  }
  download(v: DemandeVersion) {
    const x = this.d(); if (!x) return;
    this.api.file(x.id, v.id).subscribe({
      next: blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = v.fileName || 'v0'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); },
      error: () => this.error.set('Téléchargement impossible.')
    });
  }
}
