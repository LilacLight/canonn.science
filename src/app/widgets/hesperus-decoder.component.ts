import { Component, ElementRef, ViewChild } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';

const ALPHABET = '_abcdefghijklmnopqrstuvwxyz';

const PYTHON_SOURCE = `alphabet = '_abcdefghijklmnopqrstuvwxyz'

def reorder(block, key):
    if len(block) != len(key):
        return block
    return ''.join([ block[i] for i in key ])

def keygen(password):
    key = [-1] * len(password) * 2
    a = 0
    for c in password:
        # skip over already assigned swaps
        while key[a] != -1:
            a += 1
        b = alphabet.index(c) + a
        key[a] = b
        key[b] = a
        a += 1
    print('Generated key {} from password "{}"'.format(key, password))
    return key

def decode_whitespace(code, text, whitespace=' '):
    text = list(text[3::])
    i = -1
    garbage = ''
    for c in code:
        i += alphabet.index(c)
        garbage += text[i]
        text[i] = whitespace

    print('Decoded whitespace using the code:\\n{}\\nResulting garbage:\\n{}'.format(code, garbage))
    return (''.join(text), garbage)

def decode(file, key_len, reverse_in, encoded_whitespace):
    print('\\nDecoding {} with key of length {}'.format(file, key_len))
    with open(file) as f:
        input = f.read().replace('\\n', '')
        (code, text) = input.split('-', 1)
        pass_len = key_len // 2

        if encoded_whitespace:
            password = text[0:pass_len]
            (text, garbage) = decode_whitespace(code, text)
        else:
            password = code
            text = text.lstrip('-').replace('-', ' ')

        key = keygen(password)

        text = text if not reverse_in else text[::-1]
        blocks = [ text[i:i+len(key)] for i in range(0, len(text), len(key)) ]

        decoded = ''.join([ reorder(block, key) for block in blocks ])
        print(decoded)

logs = [
    ('Log 1 VF-77655657.log', 16, False, False),
    ('Log 2 VF-77655658.log', 16, False, False),
    ('Log 3 VF-77655770.log', 6, True, True),
    ('Log 4 VF-77655771.log', 6, True, True),
]

for log in logs:
    decode(*log)
`;

const JS_SOURCE = `const alphabet = '_abcdefghijklmnopqrstuvwxyz';

function reorder(block, key) {
  if (block.length !== key.length) return block;
  return key.map((i) => block[i]).join('');
}

function keygen(password) {
  const key = new Array(password.length * 2).fill(-1);
  let a = 0;
  for (const c of password) {
    // skip over already assigned swaps
    while (key[a] !== -1) a++;
    const b = alphabet.indexOf(c) + a;
    key[a] = b;
    key[b] = a;
    a++;
  }
  return key;
}

function decodeWhitespace(code, text, whitespace = ' ') {
  const chars = [...text.slice(3)];
  let i = -1;
  let garbage = '';
  for (const c of code) {
    i += alphabet.indexOf(c);
    garbage += chars[i];
    chars[i] = whitespace;
  }
  return { text: chars.join(''), garbage };
}

// input: the log's full text; keyLen: 16 or 6; reverseIn / encodedWhitespace: booleans
function decode(input, keyLen, reverseIn, encodedWhitespace) {
  input = input.replace(/\\r?\\n/g, '');
  const split = input.indexOf('-');
  const code = input.slice(0, split);
  let text = input.slice(split + 1);
  const passLen = Math.floor(keyLen / 2);
  let password;

  if (encodedWhitespace) {
    password = text.slice(0, passLen);
    text = decodeWhitespace(code, text).text;
  } else {
    password = code;
    text = text.replace(/^-+/, '').replaceAll('-', ' ');
  }

  const key = keygen(password);
  if (reverseIn) text = [...text].reverse().join('');

  let decoded = '';
  for (let i = 0; i < text.length; i += key.length) {
    decoded += reorder(text.slice(i, i + key.length), key);
  }
  return decoded;
}
`;

/**
 * Encoded log text for each preset (the contents of the .log file). These are the four Scriveners Clan upload
 * logs as transcribed on the Elite Dangerous Wiki ("The Scriveners Clan Dredger" page). That transcription has a
 * few dropped, extra or misread characters, which were repaired so each log decodes: a missing or extra character
 * per damaged line (checked against the decoded text on this page) and, for Logs 3 and 4, a misread whitespace
 * code (checked against the repeating filler message). They may still differ from the original in-game files in
 * a few characters.
 */
const PRESETS: Record<string, { keyLen: number; reverse: boolean; whitespace: boolean; text: string }> = {
  '1': { keyLen: 16, reverse: false, whitespace: false, text: "oadbedba---Temcnigrgoe-y-.Ensil-ui-etseianhtK-em-leede,nuptu..tcg-.s-aniceyhtiih--ynocfet-raH-re.sel-psuh-ea-eerrot-t-ophtvbt-hs-ehah-pi-stynereko-nevatb-e.nes-dmeeiylosr-eoMfohts-e-t-rc-aa-ieeer-r-htedw-o--nd-rniiih,gdPki.sl-e'tu---slsrapanam-.seiaHhdot-.eb--yehTah--Isregeenepa-st-ibn,dnaolcri-duow-g-e-osymmfoo-nht-spHorwoo-.t-n-h-d--Iehtldiyeesovuocdieh--rkcaeT-m-tehh-ysuva?lebawinegn-tia--tt-t-eih-,smiubltott-yadj-yehsu-...ne-o-ifpdeer.ouCwom-tsod-n-t-ts-ir-ceifuytsrfoi-dugcnM-Inija,hU-,uhamnert-t-rTb-egrirwedc--.er-e-trer-esewamhaehtnt-dehi-oc-cnogdiah--to-sugruiol-atn-n.-nohpl-,-ynhtrteoclor.-dH-phtreesesuecP-taVirlev-esa--a--lndnga-amdeo--oehaagobt-rtutela-fe-fs-ohticheecmaat-dne-,w-n-amtioedt--t-eh--tfigee-irnengnabvew-hleuosti-tl'niope-g.dsttl-e--ebadidt-selehv-nes-tos-eriuoss-eh-lv'y-elahottnaef--crsuhroi-ssep,nhsrciow--h-fuoubudl-s--y-ah--wsr-oh'lu-.evepuoP-rhgamtahasf-necram-ireneseiafe-.frolienlrtbpoi-se-nriihts-thicytblatui-,t-es-shtbsigi--eegiyo-tanept-roieht.evreue-llvp-de'enU.s-elams..by--htmat-eihs-egn--padeoept-nt-ehhsadot-amaMs?rekA'es-.-snhtefiye-ea-kc-ttieadehtdit-o-ueh-sm-rsurm-gspphsori-,ixnlytsnss-w-erouoich-a-ovaametuitdtllnea-yd-s-tsiaAsegil-st-san-orsmi-.hturahP-amz-ipum-nenk-tswoasobuoptuor--reba-hta--neht,dnta-sehuo--yisfdnngttfohnan--nomura-taf-.dtct-snAahekemt-ynal'seh-l-elloy-a-otneng-i.t-ehf-orit-mtstsT-csnehit-eits-wraksg-em-ani-e-stauons'xe--r-thypeahs-.e-T'tsatB--usiewev-vr-.---tno--lahdt'evu-c-h-.ulH-ewowoaenaas-l-ht-evsec-ep?elponalB--k-" },
  '2': { keyLen: 16, reverse: false, whitespace: false, text: "eadhbbea---eeiaeLnunKmttel-m,nryeg-ecoeel-nn-,lrg-fat-ei.yn-'eadWnvmeoaet-g-omr--ovadduenuneet-sefcd-eotverolarwrs-uoa-h-,nght-eliohfstule--ilhi-ekthi-e-psed-tTseer--dseh.-raohclgh--dodasenusph-dd-poroefp-eidlsirehomt-nwer-dec,eleo-h-ue-rrua-tio-shsthnni-urtggo-hihgroehrsti-rrbdc-,od-tetunsd-yluehywlani-tleu.--teqPiDaa-rdhsem-ipam..--nG.y,oo-htdy-ehhsopct-ps!saaeWel---vp-ahna-m-o-.tsjppehuV-i-saallschot-onuv-reo-e-etepudxesesocelhi-gtav-srac-eio-rtdraets-ntc-eawi,l-hol-ieaeeelrdvnoy-t-olhtub-nea-sc-yahel-oe.r'-rhdv-de--re-ejtrn-oosuiodn--ab-tareneh-c-.nfo'laart-of-lt-srdeooe----.hhehv-Teyatnn-am'teg-kabdocyl-m-oaocde--mndycm-soo,tlbe'---als-eloelgube--f-ttll-ono-lcotlatfr-l-c-en-hdsoypaexerironfl-aoa-ct.tr-f-f-A-eoeitwcshttn--ehiselasipv-itxeopneieegcnrtf-ny,aoulStr-.efemteoh---neoevm-awot--ntnuctnio-t-ineshmosse-,i-iyhaaent--rgeremsy-iswtshrie-nttgnayatehao--c-m-atlaniia-eentrn.caL-fet-setses'efigu-e--oatw-t-fvir-lsei-mt-'l.gogtc-oi-np-nyrest---tlhes-oenigeehtctr-n-pacmol-etoru-rsasP,amh-ipodanew-e'ntete-t.-c-tmtiBhzAuwtulnmlhiaa,--d-sl--'ttety-hallewonapktwhan--eph-.dsnes.aitu.-gmvyerah--en-meegat-oketerahe-eH-tsep-ksbr.n-lu--a" },
  '3': { keyLen: 6, reverse: true, whitespace: true, text: "bbaadcddmidjbgdfebldbbflnacifdcddndgjdfebbhkgbchbeafddfjebdbggbddggbbhnaffcdgicjcbbmcddldeebejjcalbfafchfcfcajdcahnecdcecchbcifcjcajcdcagiegeabkakagjbhgbchbbgcjbehchgfejagjdhadegbfockibdfeedbecgbdgeldcfehcbddfhccmdnleackdebbgoceigdb-cdb.dsna-ikltuexn.teonot..teyhre'rse-T.urmerdsnetioheT'rytoh.tollime-n'onktheTiwyal-.slhat'stveo,ertockaoptreyhsalteftianao-oserpsperuethknHeakoepeonlltgeatbamt-hyembrhugotonlynsaaiepPh-rmaetmathlrlhetll'teaemh-l.eltetll'slelhasl.lthTt'aneir,en-angeju.tdsteu'mlm.arBoreelngownwhiade-kytehlraybeigme.mTh-ratkdclasdunoctmmoyhmuisinso-tpadchtnteeyhnaiasclo-,tgxteisheneodchosldup?ilt-ireshsngithirehaktttsemhs-lhitaro?ndkicnbootgba-thsyeecH.veascepeadaeoptmasagn-chewrziAutmktfenhomsaoeknlwbolye-l?beiatreeneldishdohwat-tsita...e!seWrneoela-semeoetssboreehaeg.nThhloTkioto-go.dhlveatei.edisrsuoneeselangonynlusseivl,ieefl-ateoyebne-hnlodbtlteumlghiaio.hrnsihettisl-labbydlsn'ropenhitaga-ttsoiponssxiseilftth-sotf.fyimuiskiaghnisrttkanCt-'..dni.-fdunockoanseaerlighuthcatkrohepmacbs.mCasl-lomcosLkatech.nkattlconteoubo-sewlgea,hdetramdysawe-reorrarsenseifath-erdngideeonwstsrtacheefi.hrheTngifoT-leokoy.eerwaththdatcewendalorotoynratdgtathusi'-Agimzeu,insgnilsamaubsn-nrnhongifodeaschrbelnueWeove'huhl.lnsohet-ostdunl.waawa-..sl!ltlxheteamllidteg'n-ksmeohitodGsS.hioyhml.l.t.thu-asndamoneyis-ethsireewrthicfeoolonathplysngieyhre'eds-T..kdasGisoneo..enp.ervonyunoaedanlbfd-seiphtontheacbhikcote-mejestu.rl'vl'NOileneiraer-ongEeJsniuhitsiss.i.e.thhsTingi...ecRrdo" },
  '4': { keyLen: 6, reverse: true, whitespace: true, text: "daacbaabdgbebbhaeibbfcdbkeefdcdcbgjacbhifafebhlekfidclfbhjfaefhebdgbadkbckehfefgadhddkhdcffoafalkddoefckadfdaeakllaicjabrdadedgdfdhcjganbcebbicldadgdgjcaigficoaafldgdcgfjbcdefhealgdbjbmebghf-cdbo?dT-.dodleroWnathgnow?ooid-dlwhetba-lo...Hodldwheue?raytinonhasslonl-cgdH?wnoamwnyautbho-nka,tsarpxteavhese.tre-Wonsaiighnowlrutninuis'st-n.yiM-th..oensugoldubeehstwocabwearpatfesd-nusjreeka,ervwhyinrnegliagenicmlsaelshecfbohetkecs-tbeepohreell'p.iThtreish-eehnteatnrtentomiata'ecdl-eanc,snutblelowdhithasteTR-aco.ldue.mdlerbetouervonyf.lnEgheiserudlngi.-gncletginhlivinvev-ryeddeuto.ltipWdiuoidwhohest'ashs.-kThdetnorwtiannoenviltatoe-hdtentigxnipp.e.eibhitk.nd,llt-geahosis'orttintsshseiecomrtht'ry-fe.n.hetOXTC.lrkadienka-mscaistleceemheesthcacinpaghi.stwa-krsAnnaldsoss.rprlceohepicratbosmimrryath-eperohghuhigttteefind--eyrbmettsnomcarpviiganth-eleostllaegdshaveafeTulo-hdone.cewdoomsseiehdrrlaletrn.oeolrcengctntoupsorpliie-fneihetbl-md'oabd.relnnuoveeyorllidoeshhske.-dndAbedinhnlnfteeaveebstuha-Shtxmesca'.oe'selVetgaysD-ladborf,smyitniuecsriungiath-wsarenS.e'hthorseitle-hkeialsneoeldcp,isotahownypdigrerhbosg-ntkalonkio.as'mldlihitmaobdnon-ewestu...t'ihjsacb,tkco-eemidd'tncrrwaegiialnheTor-nee.edshtppateuhawunohod'vlTfe" },
};

/** Live port of Disgo's Python decoder for the four Hesperus dredger logs. */
@Component({
  selector: 'app-hesperus-decoder',
  standalone: true,
  imports: [NgIf, NgFor],
  template: `
    <section class="dec" id="Hesperus-Decoder">
      <h3>Live log decoder</h3>
      <p class="hint">
        Paste the encoded text of a dredger log, pick which log it is (this sets the options below), and press Decode.
        <button type="button" class="link" (click)="open('python')">View Python source</button> ·
        <button type="button" class="link" (click)="open('js')">View JavaScript source</button>
      </p>
      <div class="row">
        <label>Log
          <select #preset (change)="applyPreset(preset.value)">
            <option value="">Custom</option>
            <option value="1">Log 1</option>
            <option value="2">Log 2</option>
            <option value="3">Log 3</option>
            <option value="4">Log 4</option>
          </select>
        </label>
        <label>Key length <input type="number" min="2" step="2" [value]="keyLen" (input)="keyLen = +$any($event.target).value" /></label>
        <label><input type="checkbox" [checked]="reverse" (change)="reverse = $any($event.target).checked" /> Reverse text</label>
        <label><input type="checkbox" [checked]="whitespace" (change)="whitespace = $any($event.target).checked" /> Encoded whitespace</label>
      </div>
      <textarea rows="6" placeholder="Encoded log text, e.g. the contents of 'Log 1 VF-77655657.log'" [value]="input" (input)="input = $any($event.target).value"></textarea>
      <div class="row"><button type="button" class="go" (click)="run()">Decode</button></div>
      <p class="err" *ngIf="error">{{ error }}</p>
      <ng-container *ngIf="output !== null">
        <h4>Decoded</h4>
        <pre class="out">{{ output }}</pre>
      </ng-container>
      <ng-container *ngIf="steps.length">
        <h4>Steps</h4>
        <ol class="steps">
          <li *ngFor="let s of steps"><strong>{{ s.title }}</strong><pre class="out">{{ s.body }}</pre></li>
        </ol>
      </ng-container>

      <dialog #dlg class="src-dialog" (click)="backdrop($event)">
        <div class="head">
          <strong>{{ lang === 'python' ? 'Python source' : 'JavaScript source' }}</strong>
          <span>
            <button type="button" (click)="copy()">{{ copied ? 'Copied' : 'Copy' }}</button>
            <button type="button" (click)="dlg.close()">Close</button>
          </span>
        </div>
        <pre><code>{{ lang === 'python' ? python : js }}</code></pre>
      </dialog>
    </section>
  `,
  styles: [`
    .dec { margin: 1.5rem 0; padding: 1rem 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    h3 { margin-top: 0; }
    .hint { color: var(--text-muted); font-size: 0.9rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: center; margin: 0.75rem 0; }
    label { display: flex; align-items: center; gap: 0.4rem; color: var(--text-muted); font-size: 0.9rem; }
    input[type=number], select, textarea { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 0.35rem 0.5rem; font: inherit; }
    input[type=number] { width: 5rem; }
    textarea { width: 100%; box-sizing: border-box; font-family: monospace; }
    button { background: var(--accent-dim); color: var(--accent-light); border: 1px solid var(--border); border-radius: 4px; padding: 0.3rem 0.8rem; font: inherit; cursor: pointer; }
    button.go { background: var(--accent); color: #0b0e13; border: none; padding: 0.4rem 1rem; }
    button.link { background: none; border: none; padding: 0; color: var(--accent-light); text-decoration: underline; }
    .err { color: #ff8a8a; }
    .steps { padding-left: 1.25rem; }
    .steps li { margin-bottom: 0.75rem; }
    .steps .out { margin: 0.35rem 0 0; font-size: 0.85rem; }
    .out { white-space: pre-wrap; word-break: break-word; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.75rem; }
    dialog.src-dialog { width: min(900px, 94vw); max-height: 85vh; padding: 0; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; }
    dialog.src-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); }
    .head span { display: flex; gap: 0.5rem; }
    dialog pre { margin: 0; padding: 1rem; overflow: auto; max-height: calc(85vh - 3.5rem); font-size: 0.85rem; }
  `],
})
export class HesperusDecoderComponent {
  @ViewChild('dlg') dlg!: ElementRef<HTMLDialogElement>;

  readonly python = PYTHON_SOURCE;
  readonly js = JS_SOURCE;
  lang: 'python' | 'js' = 'python';
  copied = false;

  input = '';
  keyLen = 16;
  reverse = false;
  whitespace = false;
  output: string | null = null;
  steps: { title: string; body: string }[] = [];
  error = '';

  applyPreset(id: string): void {
    this.output = null;
    this.steps = [];
    this.error = '';
    const p = PRESETS[id];
    if (p) {
      this.keyLen = p.keyLen;
      this.reverse = p.reverse;
      this.whitespace = p.whitespace;
      this.input = p.text;
    }
  }

  open(lang: 'python' | 'js'): void {
    this.lang = lang;
    this.copied = false;
    this.dlg.nativeElement.showModal();
  }

  backdrop(e: MouseEvent): void {
    if (e.target === this.dlg.nativeElement) {
      this.dlg.nativeElement.close();
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.lang === 'python' ? this.python : this.js);
      this.copied = true;
    } catch { /* clipboard unavailable */ }
  }

  run(): void {
    this.error = '';
    this.steps = [];
    this.output = null;
    const step = (title: string, body: string) => this.steps.push({ title, body });
    const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)} … (${s.length} characters)` : s);
    try {
      const raw = this.input.replace(/\r?\n/g, '');
      step('Remove line breaks', `${clip(raw)}\n\nThe whole log is treated as one line of ${raw.length} characters.`);
      const split = raw.indexOf('-');
      if (split < 0) {
        throw new Error('No "-" found: the log should start with a code, then a "-", then the encoded text.');
      }
      const code = raw.slice(0, split);
      let text = raw.slice(split + 1);
      step('Split at the first "-"', `Code (before the dash): ${clip(code)}\nText (after the dash): ${clip(text)}`);
      const passLen = Math.floor(this.keyLen / 2);
      let password: string;
      if (this.whitespace) {
        password = text.slice(0, passLen);
        step(`Take the password (first ${passLen} characters of the text)`, `Password: "${password}"`);
        const chars = [...text.slice(3)];
        let i = -1;
        let garbage = '';
        for (const c of code) {
          const n = ALPHABET.indexOf(c);
          if (n < 0) throw new Error(`Unexpected character "${c}" in the whitespace code.`);
          i += n;
          if (i >= chars.length) throw new Error('The whitespace code points past the end of the text.');
          garbage += chars[i];
          chars[i] = ' ';
        }
        text = chars.join('');
        step(
          'Decode the whitespace',
          `Skip the 3 password characters. Each letter of the code (_=0, a=1 … z=26) is a number of characters to move forward; the character landed on is removed to the "garbage" and replaced by a space.\n\n` +
            `Code: ${clip(code)}\nGarbage removed: ${clip(garbage)}\nText with spaces restored: ${clip(text)}`,
        );
      } else {
        password = code;
        text = text.replace(/^-+/, '').replaceAll('-', ' ');
        step('Use the code as the password and turn dashes into spaces', `Password: "${password}"\nText: ${clip(text)}`);
      }
      const key = new Array<number>(password.length * 2).fill(-1);
      let a = 0;
      for (const c of password) {
        const n = ALPHABET.indexOf(c);
        if (n < 0) throw new Error(`Unexpected character "${c}" in the password "${password}".`);
        while (key[a] !== -1) a++;
        const b = n + a;
        if (b >= key.length) throw new Error(`Password "${password}" does not give a valid key; check the key length and options.`);
        key[a] = b;
        key[b] = a;
        a++;
      }
      step(
        'Generate the key from the password',
        `Each letter's position in "_abcdefghijklmnopqrstuvwxyz" says how far ahead to swap the next free slot with.\n\nKey (${key.length} positions): [${key.join(', ')}]\nIn 1-based form: ${key.map((k) => k + 1).join(',')}`,
      );
      if (this.reverse) {
        text = [...text].reverse().join('');
        step('Reverse the text', clip(text));
      }
      const rows: string[] = [];
      let out = '';
      for (let p = 0, n = 1; p < text.length; p += key.length, n++) {
        const block = text.slice(p, p + key.length);
        const done = block.length === key.length ? key.map((k) => block[k]).join('') : block;
        out += done;
        if (rows.length < 8) {
          rows.push(`${String(n).padStart(3)}: "${block}" → "${done}"${block.length === key.length ? '' : '  (short block, left as is)'}`);
        }
      }
      const blocks = Math.ceil(text.length / key.length);
      step(
        `Split into ${key.length}-character blocks and reorder each`,
        `${blocks} blocks. Character j of each output block is character key[j] of the input block.\n\n${rows.join('\n')}${blocks > rows.length ? '\n  …' : ''}`,
      );
      step('Join the blocks', clip(out, 200));
      this.output = out;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
}
