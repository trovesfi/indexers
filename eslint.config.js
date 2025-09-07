import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    // ...tseslint.configs.strict,
    // @todo
    // {
    //     plugins: {
    //         "unused-imports": {
    //             rules: {
    //                 "no-unused-vars": "off", // or "@typescript-eslint/no-unused-vars": "off",
    //                 "unused-imports/no-unused-imports": "warn",
    //                 "unused-imports/no-unused-vars": [
    //                     "warn",
    //                     {
    //                         "vars": "all",
    //                         "varsIgnorePattern": "^_",
    //                         "args": "after-used",
    //                         "argsIgnorePattern": "^_",
    //                     },
    //                 ],
    //             }
    //         }
    //     }
    // }
)