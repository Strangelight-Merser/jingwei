import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';
export default [
  route('embed/rule-card', 'routes/embed-rule-card.tsx'),
  route('embed/rule-card.json', 'routes/embed-rule-card-json.ts'),
  layout('routes/channel-footer.tsx', [index('routes/home.tsx'),route('situation','routes/situation.tsx'),route('compare','routes/compare.tsx'),route('changes','routes/changes.tsx'),route('articles', 'routes/articles.tsx'), route('articles/:slug', 'routes/article.tsx'), route('topics', 'routes/topics.tsx'), route('topics/:key', 'routes/topic.tsx'), route('saved', 'routes/saved.tsx'), route('settings','routes/settings.tsx'),route('maintenance','routes/maintenance.tsx'), route('settings/model','routes/model-settings.tsx'), route('follow','routes/follow.ts')]),
] satisfies RouteConfig;
