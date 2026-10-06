import {Link, Outlet} from 'react-router';
import '../channel-footer.css';

export default function ChannelFooter() {
  return <><Outlet/><nav className="channel-footer" aria-label="机构与客户经理"><strong>机构与客户经理</strong><Link to="/embed/rule-card">可嵌入规则卡</Link><Link to="/advisor">客户经理一页说明</Link></nav></>;
}
