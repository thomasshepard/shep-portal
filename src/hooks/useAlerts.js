import { useState, useEffect, useCallback } from 'react'
import { fetchAllRecords, createRecord, updateRecord, PM_BASE_ID, fmtCurrency, fmtDate } from '../lib/airtable'

const ALERTS_TABLE = 'Alerts'

// ── Alert computation ──────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function computeAlerts({ properties = [], rentalUnits = [], leases = [], tenants = [], invoicePayments = [], maintenance = [], loans = [] }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Owned properties: Status === 'Owned'
  const ownedProps = properties.filter(p => p.fields?.Status === 'Owned')
  const ownedPropIds = new Set(ownedProps.map(p => p.id))

  // Build lookup maps
  const propMap = {}
  properties.forEach(p => { if (p?.id) propMap[p.id] = p })
  const tenantMap = {}
  tenants.forEach(t => { if (t?.id) tenantMap[t.id] = t })
  const unitMap = {}
  rentalUnits.forEach(u => { if (u?.id) unitMap[u.id] = u })

  // unit → property
  const unitToPropertyId = {}
  properties.forEach(p => {
    ;(p.fields?.['Rental Units'] || []).forEach(uid => { unitToPropertyId[uid] = p.id })
  })

  // Owned unit IDs
  const ownedUnitIds = new Set(
    rentalUnits
      .filter(u => ownedPropIds.has(unitToPropertyId[u.id]))
      .map(u => u.id)
  )

  const alerts = []

  // 1. late_payment
  invoicePayments.forEach(p => {
    const pf = p.fields || {}
    const propIds = pf.Property || []
    if (!propIds.some(pid => ownedPropIds.has(pid))) return

    const status = pf.Status || ''
    const excluded = ['Paid', 'Voided', 'Payment on process']
    if (excluded.includes(status)) return
    if (!['Past Due', 'Open', 'Past due'].includes(status)) return

    const due = pf['Due Date'] ? new Date(pf['Due Date'] + 'T00:00:00') : null
    if (!due || due >= today) return

    const daysUntil = Math.ceil((due - today) / 86400000) // negative = overdue
    const propName = propIds.map(pid => propMap[pid]?.fields?.Address || '').filter(Boolean).join(', ')
    const amount = fmtCurrency(pf['Invoice Amount'])

    alerts.push({
      id: `late_payment:${p.id}`,
      type: 'late_payment',
      severity: 'critical',
      title: 'Late Payment',
      message: `${pf.Name || 'Payment'} — ${pf['Month Due'] || ''} past due (${amount}) — due ${fmtDate(pf['Due Date'])}`,
      action: 'Contact tenant or log payment',
      propertyId: propIds[0] || '',
      propertyName: propName,
      recordId: p.id,
      date: pf['Due Date'],
      daysUntil,
      dismissed: false,
    })
  })

  // 2. lease_expiring  3. lease_expired
  leases.forEach(l => {
    const lf = l.fields || {}
    const unitIds = lf.Property || []  // Lease.Property → Rental Unit IDs
    if (!unitIds.some(uid => ownedUnitIds.has(uid))) return
    if ((lf.Status || '').toLowerCase() === 'closed') return

    const months = lf['Months on Lease']
    if (months === 1) return  // skip month-to-month

    const end = lf['End Date'] ? new Date(lf['End Date'] + 'T00:00:00') : null
    if (!end) return

    const daysUntil = Math.ceil((end - today) / 86400000)
    const tenantId = (lf['Tenant Management'] || [])[0]
    const tenantName = tenantMap[tenantId]?.fields?.Name || 'Unknown Tenant'
    const unitId = unitIds[0]
    const unitName = unitMap[unitId]?.fields?.Name || ''
    const propId = unitToPropertyId[unitId]
    const propName = propMap[propId]?.fields?.Address || ''

    if (daysUntil < 0) {
      alerts.push({
        id: `lease_expired:${l.id}`,
        type: 'lease_expired',
        severity: 'critical',
        title: 'Lease Expired',
        message: `${tenantName} — lease expired ${fmtDate(lf['End Date'])} (${Math.abs(daysUntil)} days ago) — still open`,
        action: 'Renew or close lease',
        propertyId: propId || '',
        propertyName: propName,
        recordId: l.id,
        date: lf['End Date'],
        daysUntil,
        dismissed: false,
      })
    } else if (daysUntil <= 90) {
      const severity = daysUntil <= 30 ? 'critical' : daysUntil <= 60 ? 'warning' : 'info'
      alerts.push({
        id: `lease_expiring:${l.id}`,
        type: 'lease_expiring',
        severity,
        title: 'Lease Expiring',
        message: `${tenantName} @ ${unitName} — lease expires ${fmtDate(lf['End Date'])} (${daysUntil} days)`,
        action: 'Renew lease or plan turnover',
        propertyId: propId || '',
        propertyName: propName,
        recordId: l.id,
        date: lf['End Date'],
        daysUntil,
        dismissed: false,
      })
    }
  })

  // 4. maintenance_open
  maintenance.forEach(m => {
    const mf = m.fields || {}
    const propIds = mf.Property || []
    if (!propIds.some(pid => ownedPropIds.has(pid))) return

    const status = (mf.Status || '').toLowerCase()
    if (!['todo', 'in progress'].includes(status)) return

    const created = mf.Date ? new Date(mf.Date + 'T00:00:00') : null
    const daysOpen = created ? Math.ceil((today - created) / 86400000) : 0
    const severity = daysOpen >= 14 ? 'critical' : daysOpen >= 7 ? 'warning' : 'info'
    const propName = propIds.map(pid => propMap[pid]?.fields?.Address || '').filter(Boolean).join(', ')

    alerts.push({
      id: `maintenance_open:${m.id}`,
      type: 'maintenance_open',
      severity,
      title: 'Open Maintenance',
      message: `${mf.Name || 'Request'} @ ${propName || 'Unknown'} — open ${daysOpen} day${daysOpen !== 1 ? 's' : ''}`,
      action: 'Assign vendor or resolve',
      propertyId: propIds[0] || '',
      propertyName: propName,
      recordId: m.id,
      date: mf.Date,
      daysUntil: -daysOpen,
      dismissed: false,
    })
  })

  // 5. loan_maturity
  loans.forEach(loan => {
    const lf = loan.fields || {}
    const propIds = lf.Property || []
    if (propIds.length > 0 && !propIds.some(pid => ownedPropIds.has(pid))) return
    if ((lf.Status || '').toLowerCase() !== 'active') return

    const propName = propIds.map(pid => propMap[pid]?.fields?.Address || '').filter(Boolean).join(', ')

    if (!lf['Maturity Date']) {
      alerts.push({
        id: `loan_maturity:${loan.id}`,
        type: 'loan_maturity',
        severity: 'warning',
        title: 'Loan — No Maturity Date',
        message: `${lf.Name || 'Loan'} — no maturity date set`,
        action: 'Plan refinance or payoff',
        propertyId: propIds[0] || '',
        propertyName: propName,
        recordId: loan.id,
        date: null,
        daysUntil: null,
        dismissed: false,
      })
      return
    }

    const maturity = new Date(lf['Maturity Date'] + 'T00:00:00')
    const daysUntil = Math.ceil((maturity - today) / 86400000)
    if (daysUntil > 180) return

    const severity = daysUntil <= 30 ? 'critical' : daysUntil <= 90 ? 'warning' : 'info'
    alerts.push({
      id: `loan_maturity:${loan.id}`,
      type: 'loan_maturity',
      severity,
      title: 'Loan Maturity',
      message: `${lf.Name || 'Loan'} matures ${fmtDate(lf['Maturity Date'])} (${daysUntil} days) — balance ${fmtCurrency(lf['Current Amount'])}`,
      action: 'Plan refinance or payoff',
      propertyId: propIds[0] || '',
      propertyName: propName,
      recordId: loan.id,
      date: lf['Maturity Date'],
      daysUntil,
      dismissed: false,
    })
  })

  // 6. vacant_unit
  const occupiedUnitIds = new Set(
    leases
      .filter(l => (l.fields?.Status || '').toLowerCase() !== 'closed')
      .flatMap(l => l.fields?.Property || [])
  )

  rentalUnits.forEach(unit => {
    if (!ownedUnitIds.has(unit.id)) return
    if (occupiedUnitIds.has(unit.id)) return

    const uf = unit.fields || {}
    const propId = unitToPropertyId[unit.id]
    const propName = propMap[propId]?.fields?.Address || ''
    const estIncome = uf['Estimated Income'] || 0

    alerts.push({
      id: `vacant_unit:${unit.id}`,
      type: 'vacant_unit',
      severity: 'warning',
      title: 'Vacant Unit',
      message: `${uf.Name || 'Unit'} @ ${propName} — vacant${estIncome > 0 ? ` (potential: ${fmtCurrency(estIncome)}/mo)` : ''}`,
      action: 'Add tenant',
      propertyId: propId || '',
      propertyName: propName,
      recordId: unit.id,
      date: null,
      daysUntil: null,
      dismissed: false,
    })
  })

  // Sort: critical → warning → info, then by daysUntil ascending (most urgent first)
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => {
    const sev = severityOrder[a.severity] - severityOrder[b.severity]
    if (sev !== 0) return sev
    if (a.daysUntil != null && b.daysUntil != null) return a.daysUntil - b.daysUntil
    return 0
  })

  return alerts
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAlerts(airtableData, userName) {
  const [alertRecords, setAlertRecords] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch Alerts table records on mount (for dismiss state)
  useEffect(() => {
    fetchAllRecords(ALERTS_TABLE, {}, PM_BASE_ID).then(res => {
      setAlertRecords(res.data || [])
      setLoading(false)
    })
  }, [])

  // Build map: alertId → Alerts record
  const dismissMap = {}
  alertRecords.forEach(r => {
    const alertId = r.fields?.['Alert ID']
    if (alertId) dismissMap[alertId] = r
  })

  // Compute alerts from data
  const computed = computeAlerts(airtableData || {})

  // Cross-reference with dismiss state
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alerts = computed.map(alert => {
    const record = dismissMap[alert.id]
    if (!record) return alert

    const status = record.fields?.Status
    if (status === 'Resolved') return null

    const snoozeStr = record.fields?.['Snooze Until']
    const snoozeUntil = snoozeStr ? new Date(snoozeStr + 'T00:00:00') : null

    const snoozed = snoozeUntil && snoozeUntil > today
    if ((status === 'Dismissed' || status === 'Snoozed') && snoozed) {
      return {
        ...alert,
        dismissed: true,
        dismissedAt: record.fields?.['Dismissed At'] || null,
        dismissedBy: record.fields?.['Dismissed By'] || null,
        _recordId: record.id,
      }
    }

    // Snooze expired — show as active
    return { ...alert, dismissed: false, _recordId: record.id }
  }).filter(Boolean)

  const activeAlerts = alerts.filter(a => !a.dismissed)
  const dismissedAlerts = alerts.filter(a => a.dismissed)
  const counts = {
    total: activeAlerts.length,
    critical: activeAlerts.filter(a => a.severity === 'critical').length,
    warning: activeAlerts.filter(a => a.severity === 'warning').length,
    info: activeAlerts.filter(a => a.severity === 'info').length,
  }

  const dismiss = useCallback(async (alertId, notes = '') => {
    const snoozeUntil = addDays(new Date(), 30)
    const existingRecord = dismissMap[alertId]
    const alert = computed.find(a => a.id === alertId)
    const fields = {
      'Alert ID': alertId,
      Status: 'Dismissed',
      'Dismissed At': todayStr(),
      'Dismissed By': userName || 'Unknown',
      'Snooze Until': snoozeUntil,
      ...(notes ? { Notes: notes } : {}),
    }

    if (existingRecord) {
      const res = await updateRecord(ALERTS_TABLE, existingRecord.id, fields, PM_BASE_ID, { typecast: true })
      if (!res.error) {
        setAlertRecords(prev => prev.map(r =>
          r.id === existingRecord.id ? { ...r, fields: { ...r.fields, ...fields } } : r
        ))
      }
      return res
    }

    // Create new record
    const createFields = {
      ...fields,
      Type: alert?.type || 'unknown',
      Severity: alert?.severity || 'info',
      Title: alert?.title || alertId,
      Message: alert?.message || '',
      Action: alert?.action || '',
      'Source Record ID': alert?.recordId || '',
      'Created At': todayStr(),
      ...(alert?.propertyId ? { 'Property Name': [alert.propertyId] } : {}),
    }
    const res = await createRecord(ALERTS_TABLE, createFields, PM_BASE_ID, { typecast: true })
    if (!res.error && res.data) {
      setAlertRecords(prev => [...prev, res.data])
    }
    return res
  }, [alertRecords, computed, userName])

  const restore = useCallback(async (alertId) => {
    const record = dismissMap[alertId]
    if (!record) return

    const fields = {
      Status: 'Active',
      'Dismissed At': null,
      'Dismissed By': null,
      'Snooze Until': null,
    }
    const res = await updateRecord(ALERTS_TABLE, record.id, fields, PM_BASE_ID, { typecast: true })
    if (!res.error) {
      setAlertRecords(prev => prev.map(r =>
        r.id === record.id ? { ...r, fields: { ...r.fields, ...fields } } : r
      ))
    }
    return res
  }, [alertRecords])

  return { alerts, activeAlerts, dismissedAlerts, counts, dismiss, restore, loading }
}
