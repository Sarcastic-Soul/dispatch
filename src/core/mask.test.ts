import { describe, expect, it } from 'vitest';
import { mask } from './mask';
import { TICKETS } from './data';

const m = (s: string) => mask(s).text;

describe('mask', () => {
  it('masks student IDs, emails and phone extensions', () => {
    expect(m('reset link fails. N07015528')).toBe('reset link fails. [STUDENT_ID]');
    expect(m('mail from reg-office@nsu-gradcheck.example asking for my login')).toBe(
      'mail from [EMAIL] asking for my login',
    );
    expect(m('call me at x6612 or ext. 4417 or (555) 123-4567')).toBe('call me at [PHONE] or [PHONE] or [PHONE]');
  });

  it('masks names in the forms real tickets use', () => {
    expect(m('loaner laptop for next week. thx - Gabriela Santos')).toBe('loaner laptop for next week. thx - [NAME]');
    expect(m("exam is at 3. - Tomasz W., N02348817")).toBe('exam is at 3. - [NAME], [STUDENT_ID]');
    expect(m('section fails the assignment. Ms. Tran')).toBe('section fails the assignment. [NAME]');
    expect(m('my supervisor Coach Delaney says so. N08846221')).toBe('my supervisor [NAME] says so. [STUDENT_ID]');
    expect(m('Please call me now x6612. Peter Lindgren')).toBe('Please call me now [PHONE]. [NAME]');
    expect(m('Obinna Eze, N07733402, thesis render due tmrw')).toBe('[NAME], [STUDENT_ID], thesis render due tmrw');
    expect(m('Need a letter. N03344910 - Yusuf Demir')).toBe('Need a letter. [STUDENT_ID] - [NAME]');
    expect(m('Hi, my name is Maria Lopez and Canvas is down')).toBe('Hi, my name is [NAME] and Canvas is down');
  });

  it('leaves system and place names alone', () => {
    const s = 'Banner shows my forms as read-only. The Macs in Halvorsen 301 and Canvas are fine.';
    expect(m(s)).toBe(s);
    expect(m('My Banner ID N05517809 is locked')).toBe('My Banner ID [STUDENT_ID] is locked');
  });

  it('returns spans in the original text', () => {
    const raw = 'printer jam - Dr. Ito';
    const { spans } = mask(raw);
    expect(spans).toEqual([{ start: 14, end: 21, kind: 'NAME' }]);
    expect(raw.slice(spans[0].start, spans[0].end)).toBe('Dr. Ito');
  });

  it('masks extra names passed by the caller', () => {
    expect(mask('ask olu about it', ['Olu']).text).toBe('ask [NAME] about it');
  });

  it('leaves no student ID or email in any demo ticket', () => {
    for (const t of TICKETS) {
      const out = m(t.text);
      expect(out, t.id).not.toMatch(/\bN\d{8}\b/i);
      expect(out, t.id).not.toMatch(/@\w/);
      expect(out, t.id).not.toMatch(/\bx\d{4}\b/);
    }
  });
});
