/**
 * What the four questions look like in different industries — pure data, no I/O.
 *
 * The four pillars do not change: every business wants to make money, do it safely, have people who
 * are good at their jobs and love them, and stay clear to work. What changes is what each one is
 * measured BY, and that is the only thing this file varies.
 *
 * Systems are named by category, never by vendor. Every business runs a different stack, and a page
 * that lists products is a page some business is absent from.
 */
import type { Pillar } from './scoring';

export interface Sector {
  key: string;
  name: string;
  line: string;
  /** What shapes the measurement in this industry. */
  shape: string;
  /** The roles that usually carry a scorecard. Roles, never people. */
  roles: string[];
  /** System categories that usually feed the numbers. */
  systems: string[];
  /** What each pillar is actually measured by here. */
  measures: Record<Pillar, string[]>;
}

export const SECTORS: Sector[] = [
  {
    key: 'trades',
    name: 'Contracting and trades',
    line: 'Crews across several sites, work won by quote, and the margin decided before anybody picks up a tool.',
    shape: 'Labour is the largest controllable cost and the quote is where the money is made or lost, so Earnings is measured against the quote rather than against a budget.',
    roles: ['Managing Director', 'Operations Manager', 'Business Development Manager', 'Safety and Compliance Lead', 'Site Supervisor', 'Scheduler', 'Estimator'],
    systems: ['Jobs and scheduling', 'Financials', 'Safety and compliance', 'Clients and sales'],
    measures: {
      safety: ['Incidents and near misses', 'Corrective actions closed on time', 'Toolbox talks held and signed'],
      people: ['One-to-ones held', 'Turnover inside ninety days', 'Supervisors signed off as capable'],
      earnings: ['Margin against quote', 'Billable utilisation', 'Work in progress against plan'],
      compliance: ['Tickets and licences current', 'Contract obligations met', 'Records producible on request'],
    },
  },
  {
    key: 'manufacturing',
    name: 'Manufacturing',
    line: 'A line that either runs or does not, where the cost of stopping it dwarfs the cost of anything on it.',
    shape: 'Throughput and downtime dominate, so Earnings is measured per unit and per hour rather than per job.',
    roles: ['General Manager', 'Production Manager', 'Quality Manager', 'Maintenance Lead', 'Shift Supervisor', 'Planner'],
    systems: ['Jobs and scheduling', 'Financials', 'Safety and compliance', 'People and payroll'],
    measures: {
      safety: ['Lost time injuries', 'Machine guarding audits passed', 'Hazards closed within the standard'],
      people: ['Shift cover without overtime', 'Skills matrix complete', 'Turnover by shift'],
      earnings: ['Output per hour', 'Unplanned downtime', 'Scrap and rework rate'],
      compliance: ['Calibration current', 'Certifications in date', 'Audit findings closed'],
    },
  },
  {
    key: 'professional',
    name: 'Professional services',
    line: 'Time is the product, so everything turns on what is billable and what was written off.',
    shape: 'There is no site and no plant, so Safety is psychosocial before it is physical — and it is still a hard gate.',
    roles: ['Managing Partner', 'Practice Lead', 'Engagement Manager', 'Business Development Lead', 'Operations Manager'],
    systems: ['Jobs and scheduling', 'Financials', 'Clients and sales', 'People and payroll'],
    measures: {
      safety: ['Psychosocial risk assessed', 'Workload within agreed limits', 'Incidents reported and acted on'],
      people: ['Utilisation against a sustainable target', 'Retention of qualified staff', 'Development plans current'],
      earnings: ['Realisation against standard rate', 'Write-offs', 'Recovery on fixed fees'],
      compliance: ['Professional registrations current', 'Conflicts checked', 'File notes complete'],
    },
  },
  {
    key: 'healthcare',
    name: 'Health and care',
    line: 'Rostered care where the roster is the business, and a gap in it is a clinical risk before it is a cost.',
    shape: 'Compliance is not paperwork here — it is the licence to operate, so the Clear to Work gate does the heaviest lifting of any sector.',
    roles: ['Director of Nursing', 'Clinical Manager', 'Rostering Manager', 'Quality and Compliance Lead', 'Team Leader'],
    systems: ['People and payroll', 'Safety and compliance', 'Financials', 'Jobs and scheduling'],
    measures: {
      safety: ['Clinical incidents', 'Falls and pressure injuries', 'Staff assaults reported and followed up'],
      people: ['Shifts filled without agency', 'Turnover of qualified staff', 'Supervision hours delivered'],
      earnings: ['Occupancy or utilisation', 'Agency spend against plan', 'Funding claimed against delivered'],
      compliance: ['Registrations and checks current', 'Mandatory training complete', 'Accreditation actions closed'],
    },
  },
  {
    key: 'retail',
    name: 'Retail and hospitality',
    line: 'Many small transactions and a wage bill that has to move with them, week by week.',
    shape: 'Labour as a percentage of sales is the number the whole business runs on, so it is scored weekly and rolled monthly.',
    roles: ['Operations Manager', 'Area Manager', 'Store or Venue Manager', 'People and Culture Lead', 'Shift Supervisor'],
    systems: ['Financials', 'People and payroll', 'Safety and compliance', 'Clients and sales'],
    measures: {
      safety: ['Incidents and near misses', 'Food or product safety checks', 'Security incidents handled'],
      people: ['Turnover by site', 'Shifts covered without a scramble', 'Training completed before a first shift'],
      earnings: ['Wage cost as a share of sales', 'Sales against plan', 'Stock loss'],
      compliance: ['Licences current', 'Award and agreement obligations met', 'Records producible on request'],
    },
  },
];

export const sectorByKey = (key: string | null | undefined): Sector =>
  SECTORS.find(s => s.key === key) ?? SECTORS[0];

/**
 * The four questions. These never change, in any sector — which is the entire point of them.
 */
export const QUESTIONS: Record<Pillar, string> = {
  safety: 'Are we going well in Safety?',
  people: 'Does everyone love coming to work?',
  earnings: 'Are we making money?',
  compliance: 'Are we clear to work?',
};
