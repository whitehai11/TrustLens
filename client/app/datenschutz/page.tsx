export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Datenschutzerklärung</h1>
      <div className="mt-8 space-y-5 rounded-3xl bg-white/95 p-8 shadow-soft text-slate-700">
        <h2 className="text-xl font-semibold text-slate-900">Verantwortlicher</h2>

        <p>
          Verantwortlich für die Datenverarbeitung auf dieser Website ist:
          <br />
          <br />
          Maro Goth
          <br />
          Haldenweg 3
          <br />
          79853 Lenzkirch
          <br />
          Deutschland
          <br />
          E-Mail: info@gothlab.dev
        </p>

        <p>Vertreten durch die gesetzliche Vertreterin (Mutter).</p>

        <h2 className="text-xl font-semibold text-slate-900">Allgemeine Hinweise zur Datenverarbeitung</h2>

        <p>
          Der Schutz Ihrer persönlichen Daten ist uns wichtig. Personenbezogene Daten werden nur im notwendigen Umfang und im Einklang mit der Datenschutz-Grundverordnung (DSGVO) verarbeitet.
        </p>

        <p>Diese Website dient als Informations- und Analyseplattform im Bereich Online-Sicherheitsrisiken.</p>

        <h2 className="text-xl font-semibold text-slate-900">Server-Log-Dateien</h2>

        <p>Beim Aufruf der Website werden automatisch folgende Daten erfasst:</p>

        <ul className="list-disc pl-6">
          <li>IP-Adresse</li>
          <li>Datum und Uhrzeit der Anfrage</li>
          <li>aufgerufene Seite</li>
          <li>Browsertyp und Version</li>
          <li>Betriebssystem</li>
        </ul>

        <p>Diese Daten werden zur Sicherstellung des technischen Betriebs und zur Abwehr von Missbrauch verarbeitet.</p>

        <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>

        <p>Die Logdaten werden regelmäßig gelöscht.</p>

        <p>Es werden keine Tracking- oder Marketing-Cookies eingesetzt.</p>
      </div>
    </main>
  );
}