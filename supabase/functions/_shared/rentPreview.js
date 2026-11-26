import {
  nextDueDate,
  isDueToSend,
  runKey,
  splitAmounts,
  rentAccountKey,
  paymentMethodTypes,
  toCents,
  fromCents,
  fmtUsd
} from './rentMath.js'

export function buildPreview(data, today) {
  const leaseMap = new Map(data.leases.map(r => [r.id, r]))
  const lineItemMap = new Map(data.lineItems.map(r => [r.id, r]))
  const tenantMap = new Map(data.tenants.map(r => [r.id, r]))
  const unitMap = new Map(data.units.map(r => [r.id, r]))
  const propertyMap = new Map(data.properties.map(r => [r.id, r]))

  const hasLiveInvoice = key => data.invoices.some(inv => {
    const fields = inv.fields
    const status = fields.Status
    const runKey = fields['Run Key']
    const stripeInvoiceId = fields['Stripe Invoice ID']
    if (runKey !== key) return false
    if (status === 'void') return false
    if (status === 'draft' && !stripeInvoiceId) return false
    return true
  })

  const activeRows = data.schedule.filter(r => r.fields.Active === true)

  const groups = new Map()
  const noLeaseRows = []

  for (const row of activeRows) {
    const leaseIds = row.fields.Lease || []
    if (leaseIds.length === 0) {
      noLeaseRows.push(row)
    } else {
      const firstLeaseId = leaseIds[0]
      if (!groups.has(firstLeaseId)) groups.set(firstLeaseId, [])
      groups.get(firstLeaseId).push(row)
    }
  }

  const rows = []
  let notDue = 0

  for (const row of noLeaseRows) {
    rows.push({
      runKey: runKey(row.id, null),
      scheduleId: row.id,
      scheduleName: row.fields.Name || '',
      leaseId: null,
      propertyId: null,
      unitId: null,
      address: '',
      payerId: null,
      payerName: '',
      email: '',
      stripeCustomerId: '',
      account: null,
      accountName: '',
      dueDate: null,
      cents: 0,
      amount: 0,
      lines: [],
      paymentMethods: [],
      sendDaysBefore: row.fields['Send Days Before'] ?? 10,
      problems: ['No lease linked']
    })
  }

  for (const [leaseId, scheduleRows] of groups.entries()) {
    const lease = leaseMap.get(leaseId)
    if (!lease || lease.fields['Billing On'] !== true || lease.fields.Status === 'Closed') {
      notDue += scheduleRows.length
      continue
    }

    const lineItemIds = lease.fields['Lease Invoice Line Item'] || []
    const lines = lineItemIds
      .map(id => lineItemMap.get(id))
      .filter(Boolean)
      .map(item => ({
        name: item.fields.Name,
        amount: Number(item.fields['Line Item Total']) || 0
      }))

    const rowsForSplit = scheduleRows.map(r => ({
      id: r.id,
      shareType: r.fields['Share Type'],
      shareValue: r.fields['Share Value'],
      dueDay: r.fields['Due Day']
    }))

    const split = splitAmounts(lines, rowsForSplit)
    const splitById = new Map((split.ok ? split.rows : []).map(r => [r.id, r]))

    const unitIds = lease.fields.Property || []
    let property = null
    let unitId = null
    let propertyId = null
    let address = ''
    let accountName = ''
    let account = null

    if (unitIds.length > 0) {
      unitId = unitIds[0]
      const unit = unitMap.get(unitId)
      if (unit) {
        const propIds = unit.fields.Property || []
        if (propIds.length > 0) {
          propertyId = propIds[0]
          property = propertyMap.get(propertyId)
          if (property) {
            address = property.fields.Address || ''
            accountName = property.fields['Stripe Account'] || ''
            account = rentAccountKey(accountName)
          }
        }
      }
    }

    const endDate = lease.fields['End Date'] || null

    for (let i = 0; i < scheduleRows.length; i++) {
      const row = scheduleRows[i]
      const f = row.fields
      const splitRow = split.ok ? splitById.get(row.id) || null : null

      const dueDay = f['Due Day']
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        rows.push({
          runKey: runKey(row.id, null),
          scheduleId: row.id,
          scheduleName: f.Name || '',
          leaseId,
          propertyId,
          unitId,
          address,
          payerId: null,
          payerName: '',
          email: '',
          stripeCustomerId: '',
          account,
          accountName,
          dueDate: null,
          cents: 0,
          amount: 0,
          lines: [],
          paymentMethods: paymentMethodTypes(f['Payment Methods']),
          sendDaysBefore: f['Send Days Before'] ?? 10,
          problems: ['Due Day missing or not 1 to 31']
        })
        continue
      }

      const dueDate = nextDueDate(dueDay, today)
      const rawSend = f['Send Days Before']

      if (!isDueToSend(dueDate, rawSend, today)) {
        notDue++
        continue
      }

      const key = runKey(row.id, dueDate)
      if (hasLiveInvoice(key)) {
        notDue++
        continue
      }

      const payerIds = f.Payer || []
      let payerId = null
      let payerName = ''
      let email = ''
      let stripeCustomerId = ''

      if (payerIds.length > 0) {
        payerId = payerIds[0]
        const payer = tenantMap.get(payerId)
        if (payer) {
          payerName = payer.fields.Name || ''
          email = payer.fields.Email || ''
          stripeCustomerId = payer.fields['Stripe Customer ID'] || ''
        }
      }

      const problems = []

      if (!split.ok) {
        problems.push(split.problem)
      }

      if (!payerId) {
        problems.push('Payer has no Tenants record')
      } else if (!email) {
        problems.push('Payer has no email')
      }

      if (!property) {
        problems.push('No property on the lease unit')
      }

      if (account === null) {
        if (accountName) {
          problems.push(`Stripe account "${accountName}" is not set up for rent`)
        } else {
          problems.push('No Stripe account on the property')
        }
      }

      if (endDate && endDate < today) {
        problems.push(`Lease ended ${endDate}; update End Date or Status if it is month to month`)
      }

      let cents = 0
      let outputLines = []

      if (split.ok && splitRow) {
        cents = splitRow.cents
        if (splitRow.lines) {
          outputLines = splitRow.lines
        } else {
          const splitRowForShare = rowsForSplit.find(r => r.id === row.id)
          const shareType = splitRowForShare?.shareType
          const shareValue = splitRowForShare?.shareValue
          const monthName = new Date(dueDate + 'T12:00:00Z').toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
          let shareStr = ''
          if (shareType === 'Percent') {
            shareStr = `${Math.round(Number(shareValue) * 100) / 100}%`
          } else if (shareType === 'Fixed') {
            shareStr = fmtUsd(toCents(shareValue))
          }
          const shareLine = `Your share of ${monthName} rent, ${address} (${shareStr} of ${fmtUsd(split.totalCents)})`
          outputLines = [{ name: shareLine, cents }]
        }
      }

      let resumeDraftId = null
      const draftInvoice = data.invoices.find(inv => {
        const fields = inv.fields
        return fields['Run Key'] === key && fields.Status === 'draft' && !fields['Stripe Invoice ID']
      })
      if (draftInvoice) {
        resumeDraftId = draftInvoice.id
      }

      rows.push({
        runKey: key,
        scheduleId: row.id,
        scheduleName: f.Name || '',
        leaseId,
        propertyId,
        unitId,
        address,
        payerId,
        payerName,
        email,
        stripeCustomerId,
        account,
        accountName,
        dueDate,
        cents,
        amount: fromCents(cents),
        lines: outputLines,
        paymentMethods: paymentMethodTypes(f['Payment Methods']),
        sendDaysBefore: rawSend ?? 10,
        problems,
        resumeDraftId
      })
    }
  }

  rows.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    return a.address.localeCompare(b.address)
  })

  return { today, rows, notDue }
}