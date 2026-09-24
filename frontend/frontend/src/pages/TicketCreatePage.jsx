import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { ErrorMessage, InlineWarning, LoadingIndicator } from '../components/StatusBlocks';
import { api } from '../lib/api';
import { fromDateTimeLocalInput, toDateTimeLocalInput } from '../lib/utils';

const initialForm = {
  ticket_id: '',
  subject: '',
  description: '',
  customer_account_tier: '',
  product_line: '',
  manual_priority: '',
  channel: '',
  status: 'new',
  assigned_team_id: '',
  created_at: toDateTimeLocalInput(new Date().toISOString()),
  triaged_at: '',
  resolved_at: '',
  resolution_category: '',
  resolution_summary: '',
  triage_suggested_priority: '',
  triage_suggested_team_id: '',
  triage_generated_at: '',
  triage_model_version: '',
  triage_confidence: '',
};

export default function TicketCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsWarning, setTeamsWarning] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api.listTeams()
      .then((data) => {
        if (active) setTeams(data.teams || []);
      })
      .catch(() => {
        if (active) setTeamsWarning('Active team lookup failed. You can still create a ticket without assigning a team.');
      })
      .finally(() => {
        if (active) setTeamsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const teamOptions = useMemo(() => teams.map((team) => ({ value: team.id, label: `${team.name} (${team.team_id})` })), [teams]);

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    setSubmitError('');
  };

  const validate = () => {
    const next = {};
    ['ticket_id', 'subject', 'description', 'customer_account_tier', 'product_line', 'status', 'created_at'].forEach((key) => {
      if (!form[key]?.trim()) next[key] = 'Required';
    });
    if (form.triage_confidence && Number.isNaN(Number(form.triage_confidence))) next.triage_confidence = 'Must be numeric';
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setSubmitError('Please correct the highlighted fields.');
      return;
    }

    const body = {
      ticket_id: form.ticket_id.trim(),
      subject: form.subject.trim(),
      description: form.description.trim(),
      customer_account_tier: form.customer_account_tier.trim(),
      product_line: form.product_line.trim(),
      status: form.status,
      created_at: fromDateTimeLocalInput(form.created_at),
      is_historical_import: false,
    };

    if (form.manual_priority) body.manual_priority = form.manual_priority;
    if (form.channel) body.channel = form.channel;
    if (form.assigned_team_id) body.assigned_team_id = form.assigned_team_id;
    if (form.triaged_at) body.triaged_at = fromDateTimeLocalInput(form.triaged_at);
    if (form.resolved_at) body.resolved_at = fromDateTimeLocalInput(form.resolved_at);
    if (form.resolution_category || form.resolution_summary) {
      body.resolution = {
        category: form.resolution_category,
        summary: form.resolution_summary,
      };
    }
    if (
      form.triage_suggested_priority ||
      form.triage_suggested_team_id ||
      form.triage_generated_at ||
      form.triage_model_version ||
      form.triage_confidence
    ) {
      body.triage_suggestion = {
        suggested_priority: form.triage_suggested_priority || null,
        suggested_team_id: form.triage_suggested_team_id || null,
        generated_at: form.triage_generated_at ? fromDateTimeLocalInput(form.triage_generated_at) : null,
        model_version: form.triage_model_version || null,
        confidence: form.triage_confidence ? Number(form.triage_confidence) : null,
      };
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await api.createTicket(body);
      navigate(`/tickets/${encodeURIComponent(response.ticket_id)}`);
    } catch (error) {
      if (error.status === 409 && error.code === 'TICKET_ID_ALREADY_EXISTS') {
        setFieldErrors((prev) => ({ ...prev, ticket_id: 'A ticket with this ID already exists.' }));
        setSubmitError('Duplicate ticket ID. Please choose another ticket_id.');
      } else if (error.status === 400 && error.code === 'INVALID_REQUEST') {
        setSubmitError('The request was rejected. Check required fields, enums, and date formats.');
      } else {
        setSubmitError('Ticket creation failed. Please retry.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Create Simulated Ticket" subtitle="Create an internal-only POV ticket for downstream review of stored triage suggestions and similar resolved tickets." />
      {submitError ? <ErrorMessage text={submitError} /> : null}
      {teamsWarning ? <InlineWarning text={teamsWarning} /> : null}
      <form className="card stack gap-md" onSubmit={handleSubmit}>
        <div className="grid two-up">
          <label>
            Ticket ID
            <input data-testid="ticket-id-input" value={form.ticket_id} onChange={(e) => onChange('ticket_id', e.target.value)} />
            {fieldErrors.ticket_id ? <span className="field-error">{fieldErrors.ticket_id}</span> : null}
          </label>
          <label>
            Customer account tier
            <input value={form.customer_account_tier} onChange={(e) => onChange('customer_account_tier', e.target.value)} />
            {fieldErrors.customer_account_tier ? <span className="field-error">{fieldErrors.customer_account_tier}</span> : null}
          </label>
        </div>
        <div className="grid two-up">
          <label>
            Subject
            <input value={form.subject} onChange={(e) => onChange('subject', e.target.value)} />
            {fieldErrors.subject ? <span className="field-error">{fieldErrors.subject}</span> : null}
          </label>
          <label>
            Product line
            <input value={form.product_line} onChange={(e) => onChange('product_line', e.target.value)} />
            {fieldErrors.product_line ? <span className="field-error">{fieldErrors.product_line}</span> : null}
          </label>
        </div>
        <label>
          Description
          <textarea rows="5" value={form.description} onChange={(e) => onChange('description', e.target.value)} />
          {fieldErrors.description ? <span className="field-error">{fieldErrors.description}</span> : null}
        </label>
        <div className="grid three-up">
          <label>
            Manual priority
            <input value={form.manual_priority} onChange={(e) => onChange('manual_priority', e.target.value)} placeholder="Optional" />
          </label>
          <label>
            Channel
            <select value={form.channel} onChange={(e) => onChange('channel', e.target.value)}>
              <option value="">Optional</option>
              <option value="email">email</option>
              <option value="chat">chat</option>
              <option value="phone">phone</option>
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => onChange('status', e.target.value)}>
              <option value="new">new</option>
              <option value="open">open</option>
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
            </select>
          </label>
        </div>
        <div className="grid two-up">
          <label>
            Created at
            <input type="datetime-local" value={form.created_at} onChange={(e) => onChange('created_at', e.target.value)} />
            {fieldErrors.created_at ? <span className="field-error">{fieldErrors.created_at}</span> : null}
          </label>
          <label>
            Assigned team
            {teamsLoading ? <LoadingIndicator text="Loading teams..." /> : (
              <select value={form.assigned_team_id} onChange={(e) => onChange('assigned_team_id', e.target.value)} disabled={!!teamsWarning}>
                <option value="">None</option>
                {teamOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            )}
          </label>
        </div>
        <div className="grid two-up">
          <label>
            Triaged at
            <input type="datetime-local" value={form.triaged_at} onChange={(e) => onChange('triaged_at', e.target.value)} />
          </label>
          <label>
            Resolved at
            <input type="datetime-local" value={form.resolved_at} onChange={(e) => onChange('resolved_at', e.target.value)} />
          </label>
        </div>
        <section className="subsection">
          <h3>Resolution fields</h3>
          <div className="grid two-up">
            <label>
              Resolution category
              <input value={form.resolution_category} onChange={(e) => onChange('resolution_category', e.target.value)} />
            </label>
            <label>
              Resolution summary
              <input value={form.resolution_summary} onChange={(e) => onChange('resolution_summary', e.target.value)} />
            </label>
          </div>
        </section>
        <section className="subsection">
          <h3>Optional stored triage suggestion</h3>
          <div className="grid three-up">
            <label>
              Suggested priority
              <input value={form.triage_suggested_priority} onChange={(e) => onChange('triage_suggested_priority', e.target.value)} />
            </label>
            <label>
              Suggested team
              <select value={form.triage_suggested_team_id} onChange={(e) => onChange('triage_suggested_team_id', e.target.value)} disabled={teamsLoading || !!teamsWarning}>
                <option value="">None</option>
                {teamOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </label>
            <label>
              Confidence
              <input value={form.triage_confidence} onChange={(e) => onChange('triage_confidence', e.target.value)} />
              {fieldErrors.triage_confidence ? <span className="field-error">{fieldErrors.triage_confidence}</span> : null}
            </label>
          </div>
          <div className="grid two-up">
            <label>
              Generated at
              <input type="datetime-local" value={form.triage_generated_at} onChange={(e) => onChange('triage_generated_at', e.target.value)} />
            </label>
            <label>
              Model version
              <input value={form.triage_model_version} onChange={(e) => onChange('triage_model_version', e.target.value)} />
            </label>
          </div>
        </section>
        <div>
          <button className="button" data-testid="ticket-create-submit" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create ticket'}</button>
        </div>
      </form>
    </div>
  );
}
