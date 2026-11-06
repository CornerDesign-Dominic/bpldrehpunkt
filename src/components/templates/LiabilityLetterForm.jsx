import LiabilityWordingSuggestion from './LiabilityWordingSuggestion.jsx'
import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
const addressSections = [
  { title: 'Transportunternehmer', description: 'Empfänger des Schreibens', prefix: 'transport' },
  { title: 'Ladestelle', prefix: 'loading', dateLabel: 'Ladedatum' },
  { title: 'Entladestelle', prefix: 'unloading', dateLabel: 'Entladedatum' },
]

export default function LiabilityLetterForm({ documentData, onChange, aiReviewFields = new Set(), onNew, headingId = 'liability-form-heading', title = 'Angaben zum Schreiben', description = 'Änderungen erscheinen sofort in der Dokumentvorschau.', hideStops = false, enableWording = false, orderActivity = null, orderContent = null }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const needsAiReview = (field) => aiReviewFields.has(field) && !String(documentData[field] ?? '').trim()
  const loadingText = orderActivity?.phase === 'import'
    ? w('Transportauftrag wird aus DyCoS importiert …', 'Importing transport order from DyCoS …')
    : w('Transportauftrag wird in Drehpunkt gesucht …', 'Searching Drehpunkt for the transport order …')

  const incidentFields = <>
    <label className="form-field template-form__wide"><span><StaticText source="Sachverhalt / individueller Text" /></span><TranslatedProps sources={{ placeholder: 'Beschreiben Sie den Sachverhalt für dieses Schreiben.' }}><textarea rows="5" value={documentData.incidentText} onChange={(event) => onChange('incidentText', event.target.value)} aria-invalid={needsAiReview('incidentText')} placeholder="Beschreiben Sie den Sachverhalt für dieses Schreiben." /></TranslatedProps></label>
    {enableWording && <div className="template-form__wide"><LiabilityWordingSuggestion text={documentData.incidentText} onAccept={value => onChange('incidentText', value)} /></div>}
  </>

  return <>
    {enableWording && <section className="template-form-section" aria-labelledby={`${headingId}-incident`}>
      <div className="template-section-heading"><div><h2 id={`${headingId}-incident`}>{w('Sachverhalt beschreiben und formulieren', 'Describe and word the incident')}</h2><p>{w('Sachverhalt eingeben und bei Bedarf einen KI-Formulierungsvorschlag anfordern.', 'Describe the incident and request an AI wording suggestion if needed.')}</p></div></div>
      <div className="template-form-grid">{incidentFields}</div>
    </section>}
    <section className="template-form-section" aria-labelledby={headingId}>
    <div className="template-section-heading"><div><h2 id={headingId}>{title}</h2>{description && <p>{description}</p>}</div>{onNew && <button className="button button--secondary" type="button" onClick={onNew}><StaticText source="Neu" /></button>}</div>
    <div className="template-form-grid">
      {!enableWording && incidentFields}
      <div className="template-document-details">
        <label className="form-field template-order-field"><span><StaticText source="Auftragsnummer" /></span><input disabled={Boolean(orderActivity)} value={documentData.orderNumber} onChange={(event) => onChange('orderNumber', event.target.value)} aria-invalid={needsAiReview('orderNumber')} /></label>
        <label className="form-field template-document-date-field"><span><StaticText source="Belegdatum" /></span><input type="date" value={documentData.date} onChange={(event) => onChange('date', event.target.value)} /></label>
      </div>
      <div className={`liability-order-fields template-form__wide${orderActivity ? ' liability-order-fields--loading' : ''}`} aria-busy={Boolean(orderActivity)}>
        <fieldset disabled={Boolean(orderActivity)} className="liability-order-fields__fieldset">
          <legend className="sr-only">{w('Auftragsdaten', 'Order details')}</legend>
          <div className="template-address-grid">
            {addressSections.filter(section => !hideStops || section.prefix === 'transport').map(({ title, description, prefix, dateLabel }) => <section className="template-address-section" key={prefix} aria-labelledby={`${headingId}-${prefix}-address-heading`}>
              <div className="template-address-section__heading"><h3 id={`${headingId}-${prefix}-address-heading`}><StaticText source={title} /></h3>{description && <p><StaticText source={description} /></p>}</div>
              <div className="template-address-section__grid">
                {[['Company', 'Firma / Name'], ['Street', 'Straße'], ['Zip', 'PLZ'], ['City', 'Ort'], ['Country', 'Land']].map(([suffix, label]) => <label className={`form-field${['Company', 'Street', 'Country'].includes(suffix) ? ' template-address-section__wide' : ''}`} key={suffix}><span><StaticText source={label} /></span><input value={documentData[`${prefix}${suffix}`]} onChange={event => onChange(`${prefix}${suffix}`, event.target.value)} aria-invalid={needsAiReview(`${prefix}${suffix}`)} /></label>)}
                {dateLabel && <label className="form-field template-address-section__wide"><span><StaticText source={dateLabel} /></span><input type="date" value={documentData[`${prefix}Date`]} onChange={(event) => onChange(`${prefix}Date`, event.target.value)} aria-invalid={needsAiReview(`${prefix}Date`)} /></label>}
              </div>
            </section>)}
          </div>
          {orderContent}
        </fieldset>
        {orderActivity && <div className="liability-order-fields__overlay" role="status"><span className="liability-loading-spinner" aria-hidden="true" /><strong>{loadingText}</strong><span>{w('Belegdatum und Sachverhalt kannst du währenddessen weiter bearbeiten und die KI nutzen.', 'You can keep editing the document date and description and use AI in the meantime.')}</span></div>}
      </div>
    </div>
    </section>
  </>
}
