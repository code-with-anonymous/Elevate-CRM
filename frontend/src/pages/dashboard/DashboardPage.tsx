// ─────────────────────────────────────────────────────────────────────────────
// src/pages/dashboard/DashboardPage.tsx
// Main dashboard page with 3-column responsive grid layout
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

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Helmet>
        <title>Dashboard | ElevateCRM</title>
      </Helmet>

      <WelcomeHeader />

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-6"
      >
        {/* LEFT COLUMN: A1, A2, A3, A4 */}
        <div className="flex flex-col gap-6 md:col-span-5 xl:col-span-3">
          <motion.div variants={itemVariants}><PipelineGoalCard /></motion.div>
          <motion.div variants={itemVariants}><WeeklyRevenueCard /></motion.div>
          <motion.div variants={itemVariants}><ConversionCard /></motion.div>
          <motion.div variants={itemVariants}><FollowUpsCard /></motion.div>
        </div>

        {/* CENTER COLUMN: B1, B2 */}
        <div className="flex flex-col gap-6 md:col-span-7 xl:col-span-6">
          <motion.div variants={itemVariants}><PipelineEngagementChart /></motion.div>
          <motion.div variants={itemVariants} className="flex flex-1"><LeadActivityTable /></motion.div>
        </div>

        {/* RIGHT COLUMN: C1, C2, C3 */}
        <div className="flex flex-col gap-6 md:col-span-12 xl:col-span-3">
          <motion.div variants={itemVariants}><RevenueGoalCard /></motion.div>
          <motion.div variants={itemVariants}><AIInsightsCard /></motion.div>
          <motion.div variants={itemVariants} className="flex-1 min-h-[250px]"><LeadsBySourceCard /></motion.div>
        </div>
      </motion.div>
    </div>
  );
}
