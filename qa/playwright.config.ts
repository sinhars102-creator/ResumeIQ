import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './tests',
  retries: 1,
  workers: 4,
  outputDir: process.env.QA_OUT || './runs/latest',
  reporter: [['html', { open: 'never', outputFolder: './runs/latest-html' }], ['json', { outputFile: 'runs/results.json' }], ['list']],
  use: { baseURL: process.env.BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'laptop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-safari', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
    { name: 'laptop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
    { name: 'iphone-14', use: { ...devices['iPhone 14'] } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'budget-android', use: { ...devices['Moto G4'] } },
  ],
});
