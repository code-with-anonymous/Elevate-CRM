// ─────────────────────────────────────────────────────────────────────────────
// src/pages/dashboard/DashboardPage.tsx
// Three-column grid. Structure is unchanged — the columns worked — but the
// stagger now runs off the shared motion vocabulary (8px rise, 30ms apart)
// instead of a bespoke 20px/100ms curve, so it matches every other page.
//
// No hooks live here: each card owns its own query, exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import WelcomeHeader from '@/components/dashboard/WelcomeHeader';
import PipelineGoalCard from '@/components/dashboard/PipelineGoalCard';
import WeeklyRevenueCard from '@/components/dashboard/WeeklyRevenueCard';
import ConversionCard from '@/components/dashboard/ConversionCard';
import FollowUpsCard from '@/components/dashboard/FollowUpsCard';
import PipelineEngagementChart from '@/components/dashboard/PipelineEngagementChart';
import LeadActivityTable from '@/components/dashboard/LeadActivityTable';
import LeadsBySourceCard from '@/components/dashboard/LeadsBySourceCard';
import AIInsightsCard from '@/components/dashboard/AIInsightsCard';
import RevenueGoalCard from '@/components/dashboard/RevenueGoalCard';
import { staggerContainer, staggerItem } from '@/lib/motion';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <Helmet>
        <title>Dashboard | ElevateCRM</title>
      </Helmet>

      <WelcomeHeader />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-12"
      >
        {/* Left — hero metric and the two supporting figures */}
        <div className="flex flex-col gap-6 md:col-span-5 xl:col-span-3">
          <motion.div variants={staggerItem}>
            <PipelineGoalCard />
          </motion.div>
          <motion.div variants={staggerItem}>
            <WeeklyRevenueCard />
          </motion.div>
          <motion.div variants={staggerItem}>
            <ConversionCard />
          </motion.div>
          <motion.div variants={staggerItem}>
            <FollowUpsCard />
          </motion.div>
        </div>

        {/* Center — chart over activity */}
        <div className="flex flex-col gap-6 md:col-span-7 xl:col-span-6">
          <motion.div variants={staggerItem}>
            <PipelineEngagementChart />
          </motion.div>
          <motion.div variants={staggerItem} className="flex flex-1">
            <LeadActivityTable />
          </motion.div>
        </div>

        {/* Right — goal, AI, distribution */}
        <div className="flex flex-col gap-6 md:col-span-12 xl:col-span-3">
          <motion.div variants={staggerItem}>
            <RevenueGoalCard />
          </motion.div>
          <motion.div variants={staggerItem}>
            <AIInsightsCard />
          </motion.div>
          <motion.div variants={staggerItem} className="min-h-[250px] flex-1">
            <LeadsBySourceCard />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
