import codeframe from 'eslint-formatter-codeframe';
import sarif from '@microsoft/eslint-formatter-sarif';

export default function formatter(results, data) {
    console.log(codeframe(results, data));

    return sarif(results, data);
}
