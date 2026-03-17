import { feedManager } from './feedManager';
import { naadAdapter } from './naadFeed';
import { hydroAdapter } from './hydroQuebec';
import { openSkyAdapter } from './openSkyFeed';
import { rssAdapter } from './rssFeed';

export function registerAllFeeds() {
  feedManager.registerAdapter(naadAdapter);
  feedManager.registerAdapter(hydroAdapter);
  feedManager.registerAdapter(openSkyAdapter);
  feedManager.registerAdapter(rssAdapter);
}
