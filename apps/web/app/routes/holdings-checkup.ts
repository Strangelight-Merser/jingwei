import type {ActionFunctionArgs} from 'react-router';
import {holdingsRequest} from '../lib/holdings-proxy.server.ts';
export const action = ({request}: ActionFunctionArgs) => holdingsRequest(request, 'checkup');
