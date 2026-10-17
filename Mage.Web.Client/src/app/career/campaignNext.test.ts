import { describe, expect, it } from 'vitest';
import type { CareerCampaign } from '../../protocol/generated/views';
import { campaignPlacePath, nextCampaignStop, type CampaignPlace } from './careerModesData';

const place: CampaignPlace = { base: '/career/campaign', campaignId: 'conquest', chapterId: 'c11', nodeId: 'd1' };

function campaign(chapters: CareerCampaign['chapters']): CareerCampaign[] {
  return [{ id: 'conquest', chapters }];
}

describe('campaign links', () => {
  it('lead back to the stop played, or straight to a stop\'s face-off', () => {
    expect(campaignPlacePath(place)).toBe('/career/campaign?story=conquest&chapter=c11&node=d1');
    expect(campaignPlacePath(place, true)).toBe('/career/campaign?story=conquest&chapter=c11&node=d1&versus=1');
  });

  it('keep a school page\'s own query', () => {
    expect(campaignPlacePath({ ...place, base: '/career/academy?school=modern' }))
      .toBe('/career/academy?school=modern&chapter=c11&node=d1');
  });
});

describe('the next stop after a win', () => {
  it('is the chapter\'s next open stop', () => {
    const next = nextCampaignStop(campaign([{
      id: 'c11',
      nodes: [{ id: 'd1', name: 'Counterpunch', state: 'done' }, { id: 'd2', name: 'Devour for Power', state: 'open' }],
    }]), place);
    expect(next).toEqual({ name: 'Devour for Power', path: '/career/campaign?story=conquest&chapter=c11&node=d2&versus=1' });
  });

  it('moves on to the next chapter once this one is done, and is null when nothing is open', () => {
    const chapters: CareerCampaign['chapters'] = [
      { id: 'c11', done: true, nodes: [{ id: 'd1', state: 'done' }] },
      { id: 'c13', nodes: [{ id: 'e1', name: 'Eternal Bargain', state: 'open' }] },
    ];
    expect(nextCampaignStop(campaign(chapters), place)?.path).toBe('/career/campaign?story=conquest&chapter=c13&node=e1&versus=1');
    expect(nextCampaignStop(campaign([{ id: 'c11', done: true, nodes: [{ id: 'd1', state: 'done' }] }]), place)).toBeNull();
  });
});
